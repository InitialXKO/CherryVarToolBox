# Var 中间层服务器工具箱

这是一个 Node.js 实现的中间层服务器，用于在客户端和后端 API 管理服务器之间添加变量处理功能。

## 功能

*   **变量替换**: 拦截发往 `/v1/chat/completions` 的请求，只会拦截系统提示词部分，自动替换请求体 JSON 中字符串值里的特定变量。
*   **天气获取**: 定时（每天凌晨4点和启动时）通过后端 API 获取天气信息并缓存，供 `{{WeatherInfo}}` 变量使用。
*   **本地图床**：可以通过 /images/ 路径访问 image/ 目录下的文件，例如 http://<服务器地址>:<端口>/images/LightBackground.png。实现本地背景，本地表情包等功能。
*   **请求转发**: 将处理后的请求转发给配置的后端 API 服务器。
*   **认证**: 通过简单的 Bearer Token 对客户端请求进行认证。
*   **记忆库**： 跨多客户端的长期记忆库。

## 配置

所有配置项都在 `config.env` 文件中：

*   `API_Key`: 后端 API 管理服务器的访问密钥。
*   `API_URL`: 后端 API 管理服务器的地址 (例如 `http://localhost:3000`)。
*   `Port`: 中间层服务器监听的端口 (例如 `5980`)。
*   `Key`: 客户端访问中间层服务器所需的认证密钥 (例如 `123456`)。
*   `SystemInfo`: 自定义系统信息变量的值。
*   `WeatherInfo`: 缓存天气信息的文件路径 (默认为 `Weather.txt`)。
*   `WeatherModel`: 用于获取天气的后端 API 模型名称。
*   `WeatherPrompt`: 获取天气时发送给模型的提示语（其中 `{{Date::time}}` 会被替换）。

请根据你的实际环境修改 `config.env` 文件。

## 安装

在项目根目录下打开终端，运行以下命令安装依赖：

```bash
npm install
```

## 运行

有两种方式启动服务器：

1.  **直接运行**:
    ```bash
    node server.js
    ```
2.  **使用脚本 (Windows)**:
    双击运行 `start_server.bat` 文件。

服务器启动后会监听在 `config.env` 中配置的 `Port` 上。

## 支持的变量

在发送给中间层服务器的 JSON 请求体字符串中，可以使用以下变量：

*   `{{Date}}`: 当前日期。
*   `{{Time}}`: 当前时间。
*   `{{City}}`: `config.env` 中定义的当前城市。
*   `{{Today}}`: 当天星期几 (中文)。
*   `{{Festival}}`: 农历日期、节气和节日。
*   `{{SystemInfo}}`: `config.env` 中定义的系统信息。
*   `{{WeatherInfo}}`: 当前缓存的天气预报。
*   `{{XX日记本}}`: 调用单个智能体所有长期记忆。
*   ……
*   使用如上方式调用ENV中的占位符。

** 请求示例:**

```
POST /v1/chat/completions HTTP/1.1
Host: localhost:5980
Content-Type: application/json
Authorization: Bearer 123456

{
  "model": "some-model",
  "messages": [
    {
      "role": "system",
      "content": "今天是 {{Date}}，{{time}}，{{Today}}。天气：{{WeatherInfo}}"
    },
    {
      "role": "user",
      "content": "你好！"
    }
  ]
}


** 日记创建实例： **

``` DailyNote
<<<DailyNoteStart>>>
Maid: 小克
Date: 2025.5.3
Content:今天和主人聊天超开心喵，所以要写日记！
<<<DailyNoteEnd>>>
```
