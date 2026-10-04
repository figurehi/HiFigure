# 匿名发布说明

此目录是独立的 HiFigure 源码副本。保留了工作目录中的当前应用源码、测试、
共享任务定义、空白问卷与访谈提纲，以及第三方许可与署名。

## 已处理内容

- 不包含原仓库的 `.git`、提交历史、远程地址和提交者身份。
- 不包含真实 `.env`、API 密钥、GitHub token 或前端许可密钥；提供空白 `.env.example`。
- 数据下载脚本改为显式配置数据仓库，不再指向作者的个人账号。
- 不包含参与者日志、访谈记录、研究结果、IRB 材料和本地会话。
- 不包含 Word/PPT 文档、界面截图、论文草稿、视频和本地导出文件。
- 不包含本地依赖、虚拟环境、构建缓存、数据集、模型权重和 FAISS 索引。
- 保留 HiFigure 名称及第三方项目的许可署名；匿名化针对本项目作者的身份信息。

## 上传 GitHub

使用独立的匿名 GitHub 账号创建空仓库。仓库拥有者、提交者身份及外部链接
也会影响匿名性，本地文件清理无法隐藏 GitHub 账号本身。

在本目录创建全新的历史，并在第一次提交前设置仅用于匿名发布的身份：

```bash
git init -b main
git config --local user.name "Anonymous Authors"
git config --local user.email "anonymous@example.invalid"
git config --local commit.gpgsign false
git config --local tag.gpgsign false
git add .
git diff --cached --stat
git commit -m "Anonymous source release"
```

然后按新建空仓库的说明添加匿名远程地址并上传。不要复制原项目的 `.git`。
真实配置、数据和生成输出应继续保存在本地，`.gitignore` 已列入相应规则。

## 运行范围

安装与启动方式见 [README.md](README.md)。检索数据需单独提供，模型功能需
使用者自己的凭证。本副本保留研究记录功能，但不附带已有记录。
原项目未指定的源码许可证未在此擅自新增；现有第三方许可说明完整保留。

## 验证结果

- 后端现有测试：6 项通过；前端现有测试：215 项通过。
- Python、JSON 和 Shell 语法检查通过。
- 未发现已识别作者身份、个人路径或原本地配置中的密钥及私有服务地址。
- 已检查配置示例的可提交性，以及真实配置、研究记录和运行产物的忽略规则。
- 未执行需要真实凭证、完整检索数据或外部模型服务的端到端验证。
