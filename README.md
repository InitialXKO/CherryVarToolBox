# Var 中间层服务器工具箱

这是一个 Node.js 实现的中间层服务器，用于在客户端和后端 API 管理服务器之间添加动态变量处理、内容缓存、即时图床、跨客户端知识库等功能扩展。

## 主要功能

*   **通用变量替换**: 拦截发往 `/v1/chat/completions` 的请求，自动替换请求体 JSON 中 `messages` 数组内字符串内容里的特定占位符变量（见下方“支持的变量”）。支持文本和 Vision 请求格式。
*   **天气获取与缓存**: 定时（每天凌晨4点和启动时）通过配置的 API 和模型获取指定城市的天气信息，并缓存到文件，供 `{{WeatherInfo}}` 变量使用。
*   **表情包系统**:
    *   **动态列表生成**: 启动时自动扫描 `image/通用表情包` 及各角色表情包目录（如 `image/小克表情包`），生成表情包文件名列表并写入对应的 `.txt` 文件（如 `小克表情包.txt`）。
    *   **提示词注入**: 通过 `{{EmojiPrompt}}` 变量将表情包的使用说明和通用表情包列表注入到提示词中。
    *   **角色专属表情包**: 通过 `{{角色名表情包}}` 变量（如 `{{小克表情包}}`）注入特定角色的表情包列表。
*   **日记/记忆库系统**:
    *   **内容提取**: 自动检测并提取 AI 回复中被 `<<<DailyNoteStart>>>` 和 `<<<DailyNoteEnd>>>` 包裹的结构化日记内容。
    *   **文件存储**: 将提取的日记内容根据 `Maid:` 和 `Date:` 字段，保存到 `dailynote/角色名/日期.txt` 文件中。支持同日多条日记自动编号。
    *   **内容注入**: 通过 `{{角色名日记本}}` 变量（如 `{{小克日记本}}`）将指定角色存储的所有日记内容注入到提示词中。
*   **系统提示词转换**: 启动时加载 `config.env` 中定义的 `DetectorX` 和 `Detector_OutputX` 规则，在处理请求时自动将匹配到的 `DetectorX` 文本替换为对应的 `Detector_OutputX` 文本。
*   **本地静态文件服务**: 通过 `/images/` 路径提供 `image/` 目录下的静态文件访问（如图床）。
*   **请求转发**: 将处理（变量替换、提示词转换等）后的请求转发给配置的后端 API 服务器。
*   **认证**: 通过 Bearer Token 对访问中间层的客户端请求进行认证。

## 配置 (`config.env`)

所有配置项都在 `config.env` 文件中：

*   `API_Key`: 后端 API 管理服务器的访问密钥。
*   `API_URL`: 后端 API 管理服务器的地址 (例如 `http://localhost:3000`)。
*   `Port`: 中间层服务器监听的端口 (例如 `5890`)。
*   `Key`: 客户端访问中间层服务器所需的认证密钥 (例如 `123456`)。
*   `SystemInfo`: 自定义系统信息变量 (`{{SystemInfo}}`) 的值。
*   `WeatherInfo`: 缓存天气信息的文件路径 (默认为 `Weather.txt`)。
*   `City`: 获取天气的目标城市 (`{{City}}`)。
*   `WeatherModel`: 用于获取天气的后端 API 模型名称。
*   `WeatherPrompt`: 获取天气时发送给模型的提示语模板 (支持 `{{Date}}`, `{{City}}` 变量)。
*   `User`: 自定义用户信息变量 (`{{User}}`) 的值。
*   `EmojiPrompt`: 表情包使用说明的提示语模板 (支持 `{{EmojiList}}` 变量)。
*   `角色名表情包`: 特定角色表情包列表文件的路径 (例如 `xx表情包=xx表情包.txt`)。
*   `DetectorX`: 需要被检测和替换的系统提示词片段 (X为数字，例如 `Detector1`)。
*   `Detector_OutputX`: 用于替换 `DetectorX` 的目标文本 (X为对应数字，例如 `Detector_Output1`)。

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
    双击运行 `start_server.bat` 文件 (如果存在)。

服务器启动后会监听在 `config.env` 中配置的 `Port` 上。

## 支持的变量

在发送给中间层服务器的 JSON 请求体 `messages` 数组的字符串内容中，可以使用以下占位符变量：

*   `{{Date}}`: 当前日期 (格式: YYYY/M/D)。
*   `{{Time}}`: 当前时间 (格式: H:MM:SS)。
*   `{{Today}}`: 当天星期几 (中文)。
*   `{{Festival}}`: 农历日期、生肖、节气 (例如 "乙巳蛇年四月初八 立夏")。
*   `{{SystemInfo}}`: `config.env` 中定义的 `SystemInfo` 值。
*   `{{WeatherInfo}}`: 当前缓存的天气预报文本。
*   `{{City}}`: `config.env` 中定义的 `City` 值。
*   `{{User}}`: `config.env` 中定义的 `User` 值。
*   `{{EmojiPrompt}}`: 动态生成的表情包使用说明和通用表情包列表。
*   `{{EmojiList}}`: 通用表情包文件名列表 (由 `|` 分隔)。
*   `{{角色名表情包}}`: 特定角色表情包文件名列表 (由 `|` 分隔，例如 `{{小克表情包}}`)。
*   `{{角色名日记本}}`: 指定角色存储的所有日记内容 (例如 `{{小克日记本}}`)。

**注意**: 系统提示词转换是自动进行的，不需要特定变量。

## 请求与响应示例

**请求示例 (发送给中间层)**:

```json
POST /v1/chat/completions HTTP/1.1
Host: localhost:5890
Content-Type: application/json
Authorization: Bearer 123456

{
  "model": "your-target-model",
  "messages": [
    {
      "role": "system",
      "content": "今天是 {{Date}} {{Time}} {{Today}} {{Festival}}。\n城市: {{City}}\n天气: {{WeatherInfo}}\n用户信息: {{User}}\n系统信息: {{SystemInfo}}\n{{EmojiPrompt}}\n小克专属表情包: {{小克表情包}}\n小克的日记:\n{{小克日记本}}"
    },
    {
      "role": "user",
      "content": "你好！今天天气怎么样？"
    }
  ]
}
```

**AI 回复中包含日记的示例 (由 AI 生成)**:

```text
你好！今天天气[具体天气信息]。
<<<DailyNoteStart>>>
Maid: 小克
Date: 2025.5.5
Content: 今天主人问我天气了，我很开心能帮到他。天气信息已经告诉他了。希望他今天过得愉快喵！
<<<DailyNoteEnd>>>
```

中间层服务器会自动检测 `<<<DailyNoteStart>>>` 和 `<<<DailyNoteEnd>>>` 之间的内容，并将其保存到 `dailynote/小克/2025.5.5.txt` 文件中。
