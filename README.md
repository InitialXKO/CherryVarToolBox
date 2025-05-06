# Var 中间层服务器工具箱

这是一个 Node.js 实现的中间层服务器，用于在客户端和后端 API 管理服务器之间添加动态变量处理、内容缓存、功能扩展等。

## 主要功能

*   **通用变量替换**: 拦截发往 `/v1/chat/completions` 的请求，自动替换请求体 JSON 中 `messages` 数组内字符串内容里的特定占位符变量（见下方“支持的变量”）。支持文本和 Vision 请求格式。
*   **多模态图片转译与缓存 (新)**:
    *   **功能开关 (新)**: 可通过 `config.env` 中的 `Base64Cache` (True/False) 参数启用或禁用此整个功能。禁用后，包含 Base64 图片的消息将不作处理直接转发。
    *   **自动转译**: 拦截包含 `image_url` (Base64 格式) 的用户消息，调用配置的 `ImageModel` 将图片转译为文本描述。
    *   **内容整合**: 转译后的文本以 `[IMAGEXInfo: description]` 格式整合回用户消息的文本部分，并移除原始 `image_url`。
    *   **智能缓存**: 转译结果（包含唯一ID、描述、时间戳）缓存在本地 `imagebase64.json` 文件中，避免重复识别相同图片，节省 Token 和时间。
    *   **健壮性处理**: 图片识别包含重试机制（最多3次）和回复内容长度校验（至少50字符），以提高成功率和描述质量。
    *   **高级参数控制 (新)**: 支持通过 `config.env` 配置图片模型的最大输出Token数 (`ImageModelOutput`) 和思考预算 (`ImageModelThinkingBudget`)，以优化复杂图片的识别效果。
*   **天气获取与缓存**: 定时（每天凌晨4点和启动时）通过配置的 API 和模型获取指定城市的天气信息，并缓存到文件，供 `{{WeatherInfo}}` 变量使用。
*   **表情包系统**:
    *   **动态列表生成**: 启动时自动扫描 `image/通用表情包` 及各角色表情包目录（如 `image/小克表情包`），生成表情包文件名列表并写入对应的 `.txt` 文件（如 `EmojiList.txt`, `小克表情包.txt`）。
    *   **提示词注入**: 通过 `{{EmojiPrompt}}` 变量将表情包的使用说明和通用表情包列表注入到提示词中。
    *   **角色专属表情包**: 通过 `{{角色名表情包}}` 变量（如 `{{小克表情包}}`）注入特定角色的表情包列表。
*   **日记/记忆库系统**:
    *   **内容提取**: 自动检测并提取 AI 回复中被 `<<<DailyNoteStart>>>` 和 `<<<DailyNoteEnd>>>` 包裹的结构化日记内容。
    *   **文件存储**: 将提取的日记内容根据 `Maid:` 和 `Date:` 字段，保存到 `dailynote/角色名/日期.txt` 文件中。支持同日多条日记自动编号。
    *   **内容注入**: 通过 `{{角色名日记本}}` 变量（如 `{{小克日记本}}`）将指定角色存储的所有日记内容注入到提示词中。
*   **系统提示词转换**: 启动时加载 `config.env` 中定义的 `DetectorX` 和 `Detector_OutputX` 规则，在处理请求时自动将匹配到的 `DetectorX` 文本替换为对应的 `Detector_OutputX` 文本。
*   **全局上下文转换 (新)**: 类似于系统提示词转换，启动时加载 `config.env` 中定义的 `SuperDetectorX` 和 `SuperDetector_OutputX` 规则。这些规则应用于所有通过 `replaceCommonVariables` 函数处理的文本（包括用户输入、系统消息、天气信息等），实现更广泛的文本替换。例如，可以将特定的标点符号（如 “……”）统一替换为另一种格式（如 “…”）。
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
*   `Base64Cache` (新): 布尔值 (True/False)，用于启用或禁用 Base64 图片转译和缓存功能。默认为 True。如果设置为 False，包含 Base64 图片的消息将不作处理直接转发。
*   `ImageModel` (新): 用于图片转译的多模态模型名称 (例如 `gemini-2.5-flash-preview-04-17`)。
*   `ImagePrompt` (新): 指导图片转译模型工作的提示文本。
*   `ImageModelOutput` (新): 图片识别模型请求中 `max_tokens` 的值，限制单次输出的最大Token数 (例如 `50000`，默认为 `1024`)。
*   `ImageModelContent` (新): 图片识别模型的上下文窗口大小信息 (例如 `100000`，目前仅供参考，不直接用于API请求参数)。
*   `ImageModelThinkingBudget` (新): 图片识别模型进行 CoT 推理的预算值 (例如 `20000`)。如果设置，会作为 `extra_body: {"thinking_config": {"thinking_budget": VALUE}}` 添加到请求中。
*   `EmojiPrompt`: 表情包使用说明的提示语模板 (支持 `{{EmojiList}}` 变量)。
*   `EmojiList`: 通用表情包列表文件的路径 (默认为 `EmojiList.txt`)。
*   `角色名表情包`: 特定角色表情包列表文件的路径 (例如 `小克表情包=小克表情包.txt`)。
*   `DetectorX`: 需要被检测和替换的系统提示词片段 (X为数字，例如 `Detector1`)。
*   `Detector_OutputX`: 用于替换 `DetectorX` 的目标文本 (X为对应数字，例如 `Detector_Output1`)。
*   `SuperDetectorX` (新): 需要被检测和替换的全局上下文文本片段 (X为数字，例如 `SuperDetector1="……"`)。
*   `SuperDetector_OutputX` (新): 用于替换 `SuperDetectorX` 的目标文本 (X为对应数字，例如 `SuperDetector_Output1="…"`)。

请根据你的实际环境修改 `config.env` 文件。

## 安装

在项目根目录下打开终端，运行以下命令安装依赖：

```bash
npm install
# 可能需要安装 node-fetch 如果尚未作为项目依赖添加
# npm install node-fetch 
```
(注意: `node-fetch` 已在 `reidentify_image.js` 中提及，确保它在 `package.json` 中或全局可用)

## 运行

有两种方式启动服务器：

1.  **直接运行**:
    ```bash
    node server.js
    ```
2.  **使用脚本 (Windows)**:
    双击运行 `start_server.bat` 文件 (如果存在)。

服务器启动后会监听在 `config.env` 中配置的 `Port` 上。

## 工具脚本 (新)

### 图片重新识别脚本 (`reidentify_image.js`)

此脚本用于对 `imagebase64.json` 缓存中已有的图片条目进行强制重新识别，并用新的结果覆盖旧的描述。

**用途**:
当发现某个图片的缓存描述不理想（例如，过于简短、不准确）时，可以使用此脚本来尝试获取一个更好的描述。

**使用方法**:
1.  确保已安装依赖 (`node-fetch`, `dotenv`)。
2.  在项目根目录下打开终端。
3.  执行命令: `node reidentify_image.js <IMAGE_ID>`
    *   `<IMAGE_ID>` 是 `imagebase64.json` 文件中，目标图片条目的 `id` 字段的值。

脚本会加载配置，找到指定 ID 的图片，使用 `ImageModel` 进行重新识别（包含重试和内容长度校验，并应用 `ImageModelOutput` 和 `ImageModelThinkingBudget` 配置），然后更新缓存文件。

### 清理旧图片缓存脚本 (`purge_old_cache.js`) (新)

此脚本用于清理 `imagebase64.json` 缓存文件中超过指定天数（默认为90天）的旧条目。

**用途**:
定期清理旧的图片缓存，以控制 `imagebase64.json` 文件的大小，并释放磁盘空间，同时确保内存缓存不会无限增长（如果服务器重启后重新加载整个文件）。

**使用方法**:
1.  在项目根目录下打开终端。
2.  执行命令: `node purge_old_cache.js`
    *   脚本会读取 `imagebase64.json`，移除时间戳早于90天前的条目，然后写回更新后的缓存文件。
    *   可以在脚本内部修改 `MAX_AGE_DAYS` 常量来调整最大缓存天数。

建议定期（例如每月或每季度）运行此脚本，或将其设置为系统定时任务。

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

**注意**: 系统提示词转换、全局上下文转换和图片转译（如果 `Base64Cache=True`）是自动进行的，不需要特定变量来触发。

## 请求与响应示例

**请求示例 (发送给中间层，包含图片)**:

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
      "content": "今天是 {{Date}} {{Time}} {{Today}} {{Festival}}。\n城市: {{City}}\n天气: {{WeatherInfo}}\n用户信息: {{User}}\n系统信息: {{SystemInfo}}\n{{EmojiPrompt}}"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片里是什么？{{User}}觉得它怎么样？"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSk... (非常长的Base64字符串)"
          }
        }
      ]
    }
  ]
}
```
如果 `Base64Cache=True`，中间层处理后，发往后端API的请求中，上述 `user` 消息的 `content` 会变成类似：
```json
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片里是什么？莱恩，人类，哲学家，生物学教授，男性。觉得它怎么样？\n[IMAGE1Info: 这是一张包含[详细描述]的图片...]"
        }
        // image_url 部分已被移除
      ]
    }
```
如果 `Base64Cache=False`，则 `image_url` 部分会原样保留并发送给目标模型。


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
