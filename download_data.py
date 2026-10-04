import argparse
import getpass
import hashlib
import io
import json
import logging
import os
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API = "https://api.github.com"
DEFAULT_REPO = os.environ.get("HIFIGURE_DATA_REPO")
DEFAULT_TAG = "datasets"
REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_EXTRACT_TO = "frontend/datasets"
MANIFEST_NAME = "manifest.json"
# Sidecar recording the manifest of the data currently on disk, written under the
# extracted dir so a re-run can tell whether the release moved on.
SIDECAR_NAME = ".release_manifest.json"

logger = logging.getLogger("download_data")


def request_session() -> requests.Session:
    """Create a GitHub session that tolerates transient TLS/network failures."""
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


SESSION = request_session()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default=DEFAULT_REPO, help="Dataset release repository as owner/repo; alternatively set HIFIGURE_DATA_REPO.")
    parser.add_argument("--tag", default=DEFAULT_TAG, help=f"Release tag to pull from (default: {DEFAULT_TAG}).")
    parser.add_argument(
        "--root",
        default=REPO_ROOT,
        type=Path,
        help=f"Base dir that --extract-to is resolved against (default: {REPO_ROOT}).",
    )
    parser.add_argument(
        "--extract-to",
        default=DEFAULT_EXTRACT_TO,
        help=f"Extract path relative to --root (default: {DEFAULT_EXTRACT_TO}).",
    )
    parser.add_argument("--force", action="store_true", help="Download even if the local sha256 already matches.")
    args = parser.parse_args()
    if not args.repo:
        parser.error("Specify --repo owner/repo or set HIFIGURE_DATA_REPO to your dataset release repository.")
    return args


def auth_headers() -> dict:
    # Reuse the backend's ignored local env file when python-dotenv is available.
    # This keeps private-release credentials out of shell history and source control.
    try:
        from dotenv import load_dotenv

        load_dotenv(REPO_ROOT / "backend/.env")
    except ModuleNotFoundError:
        pass

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        token = getpass.getpass(
            "GH_TOKEN not set (backend/.env is also checked). "
            "Enter GitHub token (leave blank for unauthenticated download): "
        ).strip()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_release(repo: str, tag: str, headers: dict) -> dict:
    resp = SESSION.get(f"{API}/repos/{repo}/releases/tags/{tag}", headers=headers, timeout=60)
    if resp.status_code == 404:
        raise SystemExit(f"No release found at {repo}@{tag}. Has the producer published yet?")
    if not resp.ok:
        raise SystemExit(f"GitHub API GET release -> {resp.status_code}: {resp.text[:500]}")
    return resp.json()


def asset_map(release: dict) -> dict[str, str]:
    """Map asset name -> API asset url (works for private repos with a token)."""
    return {a["name"]: a["url"] for a in release.get("assets", [])}


def download_asset(url: str, headers: dict, *, expected_bytes: int | None = None) -> bytes:
    """Fetch a release asset's raw bytes (streamed, with a terminal progress bar)."""
    # The octet-stream Accept header tells the API to return the binary, not JSON.
    resp = SESSION.get(url, headers={**headers, "Accept": "application/octet-stream"}, stream=True, timeout=600)
    if not resp.ok:
        raise SystemExit(f"Asset download -> {resp.status_code}: {resp.text[:300]}")
    buf = io.BytesIO()
    got = 0

    def show_progress(done: bool = False) -> None:
        if expected_bytes:
            width = 30
            pct = min(100, got * 100 // expected_bytes)
            filled = min(width, got * width // expected_bytes)
            bar = "#" * filled + "-" * (width - filled)
            sys.stderr.write(f"\r  downloading [{bar}] {pct:3d}% ({got / 1024 / 1024:.1f}/{expected_bytes / 1024 / 1024:.1f} MB)")
        else:
            sys.stderr.write(f"\r  downloading {got / 1024 / 1024:.1f} MB")
        if done:
            sys.stderr.write("\n")
        sys.stderr.flush()

    show_progress()
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        buf.write(chunk)
        got += len(chunk)
        show_progress()
    show_progress(done=True)
    return buf.getvalue()


def sync_archive_to_dir(data: bytes, target_dir: Path) -> None:
    """Replace target_dir with the archive contents, flattening a top-level datasets/ dir."""
    target_dir = target_dir.resolve()
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f".{target_dir.name}.", dir=target_dir.parent) as tmp_name:
        tmp_dir = Path(tmp_name)
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            # 'data' filter blocks path traversal / absolute paths from the archive.
            tar.extractall(tmp_dir, filter="data")

        children = [p for p in tmp_dir.iterdir()]
        source_dir = children[0] if len(children) == 1 and children[0].is_dir() and children[0].name == "datasets" else tmp_dir

        if target_dir.exists():
            shutil.rmtree(target_dir)
        target_dir.mkdir(parents=True)
        for child in source_dir.iterdir():
            shutil.move(str(child), target_dir / child.name)


def local_sha(sidecar: Path) -> str | None:
    if sidecar.is_file():
        try:
            return json.loads(sidecar.read_text(encoding="utf-8")).get("sha256")
        except (ValueError, OSError):
            return None
    return None


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()
    headers = auth_headers()

    release = get_release(args.repo, args.tag, headers)
    assets = asset_map(release)
    if MANIFEST_NAME not in assets:
        raise SystemExit(f"Release {args.repo}@{args.tag} has no {MANIFEST_NAME} asset.")

    manifest = json.loads(download_asset(assets[MANIFEST_NAME], headers).decode("utf-8"))
    remote_sha = manifest["sha256"]
    extract_to = Path(args.root) / args.extract_to
    sidecar = extract_to / SIDECAR_NAME

    logger.info("Remote: %s files, %.1f MB, sha256=%s", manifest.get("file_count"), manifest["bytes"] / 1024 / 1024, remote_sha)

    if not args.force and local_sha(sidecar) == remote_sha:
        logger.info("Up to date (local sha256 matches). Nothing to download.")
        return

    asset_name = manifest["asset"]
    if asset_name not in assets:
        raise SystemExit(f"Release is missing the data asset {asset_name}.")

    logger.info("Change detected -- downloading %s", asset_name)
    data = download_asset(assets[asset_name], headers, expected_bytes=manifest.get("bytes"))

    got_sha = hashlib.sha256(data).hexdigest()
    if got_sha != remote_sha:
        raise SystemExit(f"Integrity check failed: got {got_sha}, expected {remote_sha}")

    sync_archive_to_dir(data, extract_to)
    sidecar.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    logger.info("Done. Extracted %s files into %s", manifest.get("file_count"), extract_to)


if __name__ == "__main__":
    main()
