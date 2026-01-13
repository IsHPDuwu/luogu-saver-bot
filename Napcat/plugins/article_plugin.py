import aiohttp

from ncatbot.plugin_system import NcatBotPlugin, command_registry, group_filter

from ncatbot.core.event import BaseMessageEvent

from ncatbot.utils import get_log
#这些库是必须的，请通过 python -m pip install ncatbot aiohttp 安装

LOG = get_log("ArticlePlugin")


class ArticlePlugin(NcatBotPlugin):

    name = "ArticlePlugin"

    version = "1.0.0"

    dependencies = {}

    # 设置 API 基础路径

    API_BASE = "https://api.luogu.me" 

    async def on_load(self):

        LOG.info("文章查询插件已加载喵~")



    @group_filter  # 限制仅在群聊中触发

    @command_registry.command("查看文章")  # 注册命令

    async def query_article(self, event: BaseMessageEvent, article_id: str):

        """

        当接收到 "查看文章 XXXXXXXX" 时触发

        article_id 将自动获取到命令后的内容

        """

        url = f"{self.API_BASE}/article/query/{article_id}"

       

        try:

            async with aiohttp.ClientSession() as session:

                async with session.get(url) as response:

                    if response.status == 200:

                        res_json = await response.json()

                       

                        # 检查返回码和数据结构

                        if res_json.get("code") == 200 or res_json.get("success"):

                            data = res_json.get("data", {})

                            # 提取字段

                            id = data.get("id")

                            title = data.get("title")

                            authorId = data.get("authorId")

                            upvote = data.get("upvote")

                            updatedAt = data.get("updatedAt")

                            content = data.get("content")

                            # 格式化回复消息

                            reply_msg = (

                                f"查询成功！\n"

                                f"文章ID {id} | 文章标题 {title} | 作者 {authorId} | 最后更新时间 {updatedAt} | 点赞量 {upvote} \n"

                                f"文章内容 \n {content}"

                            )

                            await event.reply(reply_msg)

                        else:

                            await event.reply(f"查询失败：{res_json.get('message', '未知错误')}")

                    else:

                        await event.reply(f"网络请求失败，状态码：{response.status}")

        except Exception as e:

            LOG.error(f"查询文章出错: {e}")

            await event.reply("查询过程中出现异常，请稍后再试。")


__all__ = ["ArticlePlugin"] #导出名称应当和__init__里一样
