// server.js
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const schedule = require('node-schedule');
const lunarCalendar = require('chinese-lunar-calendar'); // 导入整个模块
const fs = require('fs').promises; // 使用 fs.promises 进行异步文件操作
const path = require('path');
const { Writable } = require('stream'); // 引入 Writable 用于收集流数据

// 加载环境变量
dotenv.config({ path: 'config.env' });

const app = express();
const port = process.env.PORT; // 从 env 或默认值获取端口
const apiKey = process.env.API_Key; // API 服务器密钥
const apiUrl = process.env.API_URL; // API 服务器地址
const serverKey = process.env.Key; // 中间层认证密钥
const systemInfo = process.env.SystemInfo;
const weatherInfoPath = process.env.WeatherInfo || 'Weather.txt'; // 天气缓存文件路径
const weatherModel = process.env.WeatherModel;
const weatherPromptTemplate = process.env.WeatherPrompt;
const city = process.env.City; // 新增：读取城市变量
const emojiPromptTemplate = process.env.EmojiPrompt; // 新增：读取表情包提示模板
const emojiListPath = process.env.EmojiList || 'EmojiList.txt'; // 新增：读取表情包列表文件路径
const emojiDir = path.join(__dirname, 'image', '通用表情包'); // 新增：表情包目录路径
const xiaoKeEmojiListPath = process.env.小克表情包 || '小克表情包.txt';
const xiaoJiEmojiListPath = process.env.小吉表情包 || '小吉表情包.txt';
const xiaoBingEmojiListPath = process.env.小冰表情包 || '小冰表情包.txt';
const xiaoNaEmojiListPath = process.env.小娜表情包 || '小娜表情包.txt';
const xiaoYuEmojiListPath = process.env.小雨表情包 || '小雨表情包.txt';
const xiaoJueEmojiListPath = process.env.小绝表情包 || '小绝表情包.txt';
const xiaoKeEmojiDir = path.join(__dirname, 'image', '小克表情包');
const xiaoJiEmojiDir = path.join(__dirname, 'image', '小吉表情包');
const xiaoBingEmojiDir = path.join(__dirname, 'image', '小冰表情包');
const xiaoNaEmojiDir = path.join(__dirname, 'image', '小娜表情包');
const xiaoYuEmojiDir = path.join(__dirname, 'image', '小雨表情包');
const xiaoJueEmojiDir = path.join(__dirname, 'image', '小绝表情包');
const userInfo = process.env.User; // 新增：读取用户变量

let cachedWeatherInfo = ''; // 用于缓存天气信息的变量
let cachedEmojiList = ''; // 新增：用于缓存表情包列表的变量
let cachedXiaoKeEmojiList = ''; // 新增：小克表情包列表缓存
let cachedXiaoJiEmojiList = ''; // 新增：小吉表情包列表缓存
let cachedXiaoBingEmojiList = ''; // 新增：小冰表情包列表缓存
let cachedXiaoNaEmojiList = ''; // 新增：小娜表情包列表缓存
let cachedXiaoYuEmojiList = ''; // 新增：小雨表情包列表缓存
let cachedXiaoJueEmojiList = ''; // 新增：小绝表情包列表缓存

// 中间件：解析 JSON 和 URL 编码的请求体，增加大小限制以支持大型 Base64 数据
app.use(express.json({ limit: '300mb' })); // 将 JSON 限制增加到 300MB
app.use(express.urlencoded({ limit: '300mb', extended: true })); // 将 URL 编码限制增加到 300MB

// --- 提供静态图片文件 ---
app.use('/images', express.static(path.join(__dirname, 'image')));
console.log(`图片服务已启动，访问路径: /images`);

// 中间件：记录所有传入请求
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] Received ${req.method} request for ${req.url} from ${req.ip}`);
    next(); // 继续处理请求
});
// 中间件：认证
app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${serverKey}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// --- 表情包列表更新与加载 (通用函数) ---
async function updateAndLoadAgentEmojiList(agentName, dirPath, filePath) {
    console.log(`尝试更新 ${agentName} 表情包列表...`);
    let newList = '';
    let errorMessage = ''; // 用于存储错误信息或最终列表
    try {
        const files = await fs.readdir(dirPath);
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
        newList = imageFiles.join('|');
        await fs.writeFile(filePath, newList);
        console.log(`${agentName} 表情包列表已更新并写入 ${filePath}`);
        errorMessage = newList; // 成功时，errorMessage 存储新列表
    } catch (error) {
        if (error.code === 'ENOENT') {
            errorMessage = `${agentName} 表情包目录 ${dirPath} 不存在，无法生成列表。`;
            console.error(errorMessage);
        } else {
            errorMessage = `更新或写入 ${agentName} 表情包列表 ${filePath} 时出错: ${error.message}`;
            console.error(errorMessage, error);
        }
        // 尝试创建包含错误信息的文件
        try {
            await fs.writeFile(filePath, errorMessage);
            console.log(`已创建空的 ${filePath} 文件，内容为错误信息。`);
        } catch (writeError) {
            console.error(`创建空的 ${filePath} 文件失败:`, writeError);
        }

        // 尝试读取旧文件（如果生成失败）
        try {
            const oldList = await fs.readFile(filePath, 'utf-8');
            // 只有当旧列表不是我们刚写入的错误信息时，才使用旧列表
            if (oldList !== errorMessage) {
                console.log(`从 ${filePath} 加载了旧的 ${agentName} 表情包列表。`);
                errorMessage = oldList; // 使用旧列表覆盖错误信息
            }
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`读取旧的 ${agentName} 表情包列表 ${filePath} 失败:`, readError);
            }
            // 读取旧文件失败，保持 errorMessage (即生成时的错误信息)
        }
    }
    return errorMessage; // 返回生成的列表或错误信息或旧列表
}

// --- 特定表情包列表的更新函数 ---
async function updateAndLoadGeneralEmojiList() {
    cachedEmojiList = await updateAndLoadAgentEmojiList('通用', emojiDir, emojiListPath);
}
async function updateAndLoadXiaoKeEmojiList() {
    cachedXiaoKeEmojiList = await updateAndLoadAgentEmojiList('小克', xiaoKeEmojiDir, xiaoKeEmojiListPath);
}
async function updateAndLoadXiaoJiEmojiList() {
    cachedXiaoJiEmojiList = await updateAndLoadAgentEmojiList('小吉', xiaoJiEmojiDir, xiaoJiEmojiListPath);
}
async function updateAndLoadXiaoBingEmojiList() {
    cachedXiaoBingEmojiList = await updateAndLoadAgentEmojiList('小冰', xiaoBingEmojiDir, xiaoBingEmojiListPath);
}
async function updateAndLoadXiaoNaEmojiList() {
    cachedXiaoNaEmojiList = await updateAndLoadAgentEmojiList('小娜', xiaoNaEmojiDir, xiaoNaEmojiListPath);
}
async function updateAndLoadXiaoYuEmojiList() {
    cachedXiaoYuEmojiList = await updateAndLoadAgentEmojiList('小雨', xiaoYuEmojiDir, xiaoYuEmojiListPath);
}
async function updateAndLoadXiaoJueEmojiList() {
    cachedXiaoJueEmojiList = await updateAndLoadAgentEmojiList('小绝', xiaoJueEmojiDir, xiaoJueEmojiListPath);
}

// --- 变量替换逻辑 ---
// 注意：这个函数现在处理所有通用变量，包括 EmojiPrompt
async function replaceCommonVariables(text) {
    // 首先检查 text 是否为 null 或 undefined，如果是，则直接返回空字符串或进行其他适当处理
    if (text == null) {
        return ''; // 或者返回 text 本身，取决于期望的行为
    }
    let processedText = String(text); // 确保处理的是字符串
    const now = new Date();

    // {{Date}} - 日期
    const date = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    processedText = processedText.replace(/\{\{Date\}\}/g, date);

    // {{Time}} - 时间
    const time = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
    processedText = processedText.replace(/\{\{Time\}\}/g, time);

    // {{Today}}
    const today = now.toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' });
    processedText = processedText.replace(/\{\{Today\}\}/g, today);

    // {{Festival}}
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // getMonth() 返回 0-11，需要加 1
    const day = now.getDate();
    const lunarDate = lunarCalendar.getLunar(year, month, day); // 传递年、月、日
    let yearName = lunarDate.lunarYear.replace('年', ''); // 从 '乙巳年' 提取 '乙巳'
    let festivalInfo = `${yearName}${lunarDate.zodiac}年${lunarDate.dateStr}`; // 拼接成 "乙巳蛇年四月初三"
    if (lunarDate.solarTerm) { // 检查实际的节气属性 solarTerm
        festivalInfo += ` ${lunarDate.solarTerm}`;
    }
    processedText = processedText.replace(/\{\{Festival\}\}/g, festivalInfo);

    // {{SystemInfo}}
    processedText = processedText.replace(/\{\{SystemInfo\}\}/g, systemInfo || '未配置系统信息');

    // {{WeatherInfo}}
    processedText = processedText.replace(/\{\{WeatherInfo\}\}/g, cachedWeatherInfo || '天气信息不可用');

    // {{City}}
    processedText = processedText.replace(/\{\{City\}\}/g, city || '未配置城市');

    // {{User}}
    processedText = processedText.replace(/\{\{User\}\}/g, userInfo || '未配置用户信息');

   // {{小克表情包}}
    processedText = processedText.replace(/\{\{小克表情包\}\}/g, cachedXiaoKeEmojiList || '小克表情包列表不可用');

    // {{小吉表情包}}
    processedText = processedText.replace(/\{\{小吉表情包\}\}/g, cachedXiaoJiEmojiList || '小吉表情包列表不可用');

    // {{小冰表情包}}
    processedText = processedText.replace(/\{\{小冰表情包\}\}/g, cachedXiaoBingEmojiList || '小冰表情包列表不可用');

    // {{小娜表情包}}
    processedText = processedText.replace(/\{\{小娜表情包\}\}/g, cachedXiaoNaEmojiList || '小娜表情包列表不可用');

    // {{小雨表情包}}
    processedText = processedText.replace(/\{\{小雨表情包\}\}/g, cachedXiaoYuEmojiList || '小雨表情包列表不可用');

    // {{小绝表情包}}
    processedText = processedText.replace(/\{\{小绝表情包\}\}/g, cachedXiaoJueEmojiList || '小绝表情包列表不可用');

    // {{EmojiPrompt}} - 动态生成通用 Emoji 提示
    if (processedText.includes('{{EmojiPrompt}}')) {
        let finalEmojiPrompt = '';
        if (emojiPromptTemplate) {
            finalEmojiPrompt = emojiPromptTemplate.replace(/\{\{EmojiList\}\}/g, cachedEmojiList || '表情包列表不可用');
        }
        // 使用正则表达式进行全局替换，以防模板中出现多个 {{EmojiPrompt}}
        processedText = processedText.replace(/\{\{EmojiPrompt\}\}/g, finalEmojiPrompt);
    }

// --- 处理 {{角色名日记本}} 占位符 ---
    const diaryPlaceholderRegex = /\{\{(.+?)日记本\}\}/g;
    // 使用一个临时变量来处理替换，避免在循环中修改正在迭代的字符串导致问题
    let tempProcessedText = processedText;
    const diaryMatches = tempProcessedText.matchAll(diaryPlaceholderRegex);

    // 使用 Set 存储已处理的角色名，避免重复读取同一角色的日记
    const processedCharacters = new Set();

    for (const match of diaryMatches) {
        const placeholder = match[0]; // e.g., {{小克日记本}}
        const characterName = match[1]; // e.g., 小克

        // 如果已处理过这个角色，跳过，因为 replaceAll 会处理所有实例
        if (processedCharacters.has(characterName)) {
            continue;
        }

        const diaryDirPath = path.join(__dirname, 'dailynote', characterName);
        let diaryContent = `[${characterName}日记本内容为空或不存在]`; // 默认内容

        try {
            const files = await fs.readdir(diaryDirPath);
            const txtFiles = files.filter(file => file.toLowerCase().endsWith('.txt'));
            // 按文件名（日期）排序，让日记按时间顺序排列
            txtFiles.sort();

            if (txtFiles.length > 0) {
                const fileContents = await Promise.all(
                    txtFiles.map(async (file) => {
                        const filePath = path.join(diaryDirPath, file);
                        try {
                            // 读取文件内容
                            const fileData = await fs.readFile(filePath, 'utf-8');
                            // 返回文件名（日期）和内容，方便后续格式化
                            return fileData; // 文件内容已包含 [日期] 头
                        } catch (readErr) {
                            console.error(`读取日记文件 ${filePath} 失败:`, readErr);
                            return `[读取文件 ${file} 失败]`; // 指示特定文件的错误
                        }
                    })
                );
                // 使用分隔符连接所有日记内容
                diaryContent = fileContents.join('\n\n---\n\n'); // 使用醒目的分隔符
            }
        } catch (error) {
            if (error.code !== 'ENOENT') { // ENOENT (目录未找到) 由默认消息处理
                console.error(`读取 ${characterName} 日记目录 ${diaryDirPath} 出错:`, error);
                diaryContent = `[读取${characterName}日记时出错]`;
            }
            // 如果是 ENOENT，则保持默认消息
        }
        // 替换所有该角色的日记本占位符
        tempProcessedText = tempProcessedText.replaceAll(placeholder, diaryContent);
        // 标记该角色已处理
        processedCharacters.add(characterName);
    }
    // 将处理完日记占位符的结果赋回
    processedText = tempProcessedText;
    // --- 日记本占位符处理结束 ---
    return processedText;
}

// --- 天气获取与缓存逻辑 ---
async function fetchAndUpdateWeather() {
    console.log('尝试获取最新的天气信息...');
    if (!apiUrl || !apiKey || !weatherModel || !weatherPromptTemplate) {
        console.error('获取天气所需的配置不完整 (API_URL, API_Key, WeatherModel, WeatherPrompt)');
        cachedWeatherInfo = '天气服务配置不完整';
        return;
    }

    try {
        // 替换 Prompt 中的变量 (只需要 Date 和 City)
        const now = new Date();
        const date = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
        let prompt = weatherPromptTemplate.replace(/\{\{Date\}\}/g, date);
        prompt = prompt.replace(/\{\{City\}\}/g, city || '默认城市'); // 使用读取到的 city 或默认值

        // --- First API Call ---
        let response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: weatherModel,
                messages: [{ role: 'user', content: prompt }],
                // 使用 OpenAI 兼容格式添加 tools 参数，尝试启用网页搜索
                tools: [
                    {
                        "type": "function",
                        "function": {
                            "name": "google_search", // 使用 google_search 作为工具名，根据用户提供的示例
                            "description": "Perform a Google search to find information on the web.", // 更新描述以匹配示例
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "query": {
                                        "type": "string",
                                        "description": "The search query."
                                    }
                                },
                                "required": ["query"]
                            }
                        }
                    }
                ],
                // OpenAI 风格的 tool_choice，让模型自动选择是否使用工具
                tool_choice: "auto"
            }),
        });

        if (!response.ok) {
            throw new Error(`第一次天气 API 调用失败: ${response.status} ${response.statusText}`);
        }

        let data = await response.json();
        // Removed Raw data log

        const firstChoice = data.choices?.[0];
        const message = firstChoice?.message;

        // --- Check for Tool Calls ---
        if (firstChoice?.finish_reason === 'tool_calls' && message?.tool_calls) {
            // Removed log marker
            const toolCalls = message.tool_calls;

            // Prepare messages for the second API call
            const messagesForSecondCall = [
                { role: 'user', content: prompt }, // Original user prompt
                message, // Assistant's message requesting tool call(s)
            ];

            // Add tool results (we assume the proxy handles execution, send back arguments as placeholder result)
            for (const toolCall of toolCalls) {
                 if (toolCall.type === 'function' && toolCall.function.name === 'google_search') {
                     // Removed tool result log
                     messagesForSecondCall.push({
                         role: 'tool',
                         tool_call_id: toolCall.id,
                         // Since server.js doesn't execute the search, we send back the arguments
                         // The proxy at localhost:3000 should ideally use this or have already executed it.
                         content: `Tool call requested with arguments: ${toolCall.function.arguments}`,
                     });
                 }
            }

            // --- Second API Call ---
            // Removed log marker
            response = await fetch(`${apiUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                // Send the history including the tool call request and our constructed tool result
                // DO NOT send 'tools' or 'tool_choice' in the second call
                body: JSON.stringify({
                    model: weatherModel,
                    messages: messagesForSecondCall,
                }),
            });

            if (!response.ok) {
                throw new Error(`第二次天气 API 调用失败: ${response.status} ${response.statusText}`);
            }

            data = await response.json();
            // Removed Raw data log
        } else {
             // Removed log marker
        }

        // --- Process Final Response ---
        let weatherContent = data.choices?.[0]?.message?.content || '';
        console.log('Final extracted content:', weatherContent); // Keep log for final content
        // Removed log marker

        const match = weatherContent.match(/\[WeatherInfo:(.*?)\]/s); // 使用 s 标志使 . 匹配换行符
        if (match && match[1]) {
            cachedWeatherInfo = match[1].trim();
            console.log('天气信息已更新并缓存。');
            try {
                await fs.writeFile(weatherInfoPath, cachedWeatherInfo);
                console.log(`天气信息已写入 ${weatherInfoPath}`);
            } catch (writeError) {
                console.error(`写入天气文件 ${weatherInfoPath} 失败:`, writeError);
            }
        } else {
            console.warn('从 API 返回结果中未能提取到 [WeatherInfo:...] 格式的天气信息。原始返回:', weatherContent);
            cachedWeatherInfo = '未能从API获取有效天气信息';
        }

    } catch (error) {
        console.error('获取或处理天气信息时出错:', error);
        cachedWeatherInfo = `获取天气信息时出错: ${error.message}`;
    }
}

// --- 日记处理函数 ---
// --- 修改：handleDailyNote 处理新的结构化格式 ---
async function handleDailyNote(noteBlockContent) {
    // console.log('[handleDailyNote] 开始处理新的结构化日记块...');
    const lines = noteBlockContent.trim().split('\n');
    let maidName = null;
    let dateString = null;
    let contentLines = [];
    let isContentSection = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('Maid:')) {
            maidName = trimmedLine.substring(5).trim();
            isContentSection = false; // 遇到新 Key，重置 Content 标记
        } else if (trimmedLine.startsWith('Date:')) {
            dateString = trimmedLine.substring(5).trim();
            isContentSection = false;
        } else if (trimmedLine.startsWith('Content:')) {
            isContentSection = true;
            // 如果 Content: 后面同一行有内容，也算进去
            const firstContentPart = trimmedLine.substring(8).trim();
            if (firstContentPart) {
                contentLines.push(firstContentPart);
            }
        } else if (isContentSection) {
            // Content: 之后的所有行都属于内容
            contentLines.push(line); // 保留原始行的缩进和格式
        }
    }

    const contentText = contentLines.join('\n').trim(); // 组合内容并去除首尾空白

    if (!maidName || !dateString || !contentText) {
        console.error('[handleDailyNote] 无法从日记块中完整提取 Maid, Date, 或 Content:', { maidName, dateString, contentText: contentText.substring(0,100)+ '...' });
        return;
    }

    // console.log(`[handleDailyNote] 提取信息: Maid=${maidName}, Date=${dateString}`);
    const datePart = dateString.replace(/[.-]/g, '.'); // 统一日期分隔符
    const dirPath = path.join(__dirname, 'dailynote', maidName);
    const baseFileNameWithoutExt = datePart; // e.g., "2025.5.2"
    const fileExtension = '.txt';
    let finalFileName = `${baseFileNameWithoutExt}${fileExtension}`; // Initial filename, e.g., "2025.5.2.txt"
    let filePath = path.join(dirPath, finalFileName);
    let counter = 1;

    // console.log(`[handleDailyNote] 准备写入日记: 目录=${dirPath}, 基础文件名=${baseFileNameWithoutExt}`);
    // console.log(`[handleDailyNote] 日记文本内容 (前100字符): ${contentText.substring(0, 100)}...`);

    try {
        // 确保目录存在
        // console.log(`[handleDailyNote] 尝试创建目录: ${dirPath}`);
        await fs.mkdir(dirPath, { recursive: true });
        // console.log(`[handleDailyNote] 目录已确保存在或已存在: ${dirPath}`);

        // 循环检查文件名是否存在，如果存在则尝试添加序号
        while (true) {
            try {
                await fs.access(filePath, fs.constants.F_OK); // 检查文件是否存在
                // 文件存在，生成下一个带序号的文件名
                finalFileName = `${baseFileNameWithoutExt}(${counter})${fileExtension}`; // e.g., "2025.5.2(1).txt"
                filePath = path.join(dirPath, finalFileName);
                counter++;
                // console.log(`[handleDailyNote] 文件已存在，尝试下一个序号: ${finalFileName}`);
            } catch (err) {
                // 如果错误是 ENOENT (文件不存在)，说明找到了可用的文件名
                if (err.code === 'ENOENT') {
                    // console.log(`[handleDailyNote] 找到可用文件名: ${finalFileName}`);
                    break; // 跳出循环，使用当前的 filePath
                } else {
                    // 如果是其他访问错误，则抛出异常
                    console.error(`[handleDailyNote] 检查文件 ${filePath} 存在性时发生意外错误:`, err);
                    throw err; // 重新抛出未预期的错误
                }
            }
        }

        // 使用找到的最终文件名写入文件
        // console.log(`[handleDailyNote] 最终尝试写入文件: ${filePath}`);
        await fs.writeFile(filePath, `[${datePart}] - ${maidName}\n${contentText}`); // 在内容前添加 [日期] - 署名 头
        console.log(`[handleDailyNote] 日记文件写入成功: ${filePath}`); // 记录最终写入的文件路径
    } catch (error) {
        // 保持现有的详细错误日志记录
        console.error(`[handleDailyNote] 处理日记文件 ${filePath} 时捕获到错误 (最终尝试的文件路径):`); // 指明这是最终尝试的路径
        console.error(`  错误代码 (code): ${error.code}`);
        console.error(`  系统调用 (syscall): ${error.syscall}`);
        console.error(`  路径 (path): ${error.path}`);
        console.error(`  错误号 (errno): ${error.errno}`);
        console.error(`  错误信息 (message): ${error.message}`);
        console.error(`  错误堆栈 (stack): ${error.stack}`);
    }
}

// --- 代理路由 ---
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const originalBody = req.body;

        // 处理 messages 数组中的变量替换
        if (originalBody.messages && Array.isArray(originalBody.messages)) {
            // 使用 Promise.all 来并行处理所有消息内容的变量替换
            originalBody.messages = await Promise.all(originalBody.messages.map(async (msg) => {
                // 深拷贝消息对象以避免直接修改原始请求体（可选，但更安全）
                const newMessage = JSON.parse(JSON.stringify(msg));

                if (newMessage.content && typeof newMessage.content === 'string') {
                    newMessage.content = await replaceCommonVariables(newMessage.content);
                }
                // 处理 content 是数组的情况（例如 vision 模型）
                else if (Array.isArray(newMessage.content)) {
                    newMessage.content = await Promise.all(newMessage.content.map(async (part) => {
                        if (part.type === 'text' && typeof part.text === 'string') {
                            // 深拷贝部分对象
                            const newPart = JSON.parse(JSON.stringify(part));
                            newPart.text = await replaceCommonVariables(newPart.text);
                            return newPart;
                        }
                        return part; // 对于非文本部分或格式不符的部分，保持原样
                    }));
                }
                return newMessage; // 返回处理后的消息对象
            }));
        }
        // 注意：如果 messages 数组不存在或格式不正确，这里不再自动创建或修改
        // API 服务器应该处理无效的请求结构

        // 转发请求到 API 服务器
        const response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // 使用 API 服务器的 Key
                // 传递原始请求中的其他相关头部（如果需要的话），例如 User-Agent
                ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
                ...(req.headers['accept'] && { 'Accept': req.headers['accept'] }),
                // 注意：不要转发 Host 或 Content-Length 等由 fetch 自动管理的头
            },
            body: JSON.stringify(originalBody), // 发送处理过的请求体
        });

        // 将 API 服务器的响应头复制到我们的响应中，过滤掉不需要的头
        res.status(response.status);
        response.headers.forEach((value, name) => {
            // 过滤掉可能导致问题的头信息
            // 'connection' 通常由 Node.js 或代理处理
            // 'content-length' 会根据响应体重新计算
            // 'keep-alive' 通常与 'connection' 相关
            if (!['content-encoding', 'transfer-encoding', 'connection', 'content-length', 'keep-alive'].includes(name.toLowerCase())) {
                 res.setHeader(name, value);
            }
        });

        // --- 修改开始：恢复流式转发，同时在服务器端缓存以供检查 ---
        const chunks = []; // 用于在服务器端缓存响应

        // 监听数据块
        response.body.on('data', (chunk) => {
            chunks.push(chunk); // 缓存数据块
            res.write(chunk);   // 同时将数据块流式转发给客户端
        });

        // 监听流结束
        response.body.on('end', () => {
            res.end(); // 结束客户端的响应流

            // --- 在流结束后处理日记 (修改：先处理 SSE) ---
            const responseBuffer = Buffer.concat(chunks);
            const responseString = responseBuffer.toString('utf-8');
            // console.log('[DailyNote Check] 原始响应字符串 (前10000字符):', responseString.substring(0, 10000)); // Commented out raw string log

            let fullAiResponseText = '';
            const lines = responseString.trim().split('\n');

            // Step 1: 从 SSE 流中提取并拼接内容
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonData = line.substring(5).trim();
                    if (jsonData === '[DONE]') continue; // 跳过 SSE 结束信号
                    try {
                        const parsedData = JSON.parse(jsonData);
                        // 提取流式响应中的内容片段 (兼容 delta 和 message 格式)
                        const contentChunk = parsedData.choices?.[0]?.delta?.content || parsedData.choices?.[0]?.message?.content || '';
                        if (contentChunk) {
                            fullAiResponseText += contentChunk;
                        }
                    } catch (e) {
                        // 忽略无法解析为 JSON 的行
                        // console.warn('Skipping non-JSON SSE data line:', line);
                    }
                }
                // 备选：如果 API 可能返回非 SSE 纯文本，可以在这里添加处理逻辑
                // else if (!line.startsWith(':') && line.trim() !== '') {
                //     fullAiResponseText += line + '\n';
                // }
            }

            // console.log('[DailyNote Check] 拼接后的 AI 回复文本 (前10000字符):', fullAiResponseText.substring(0, 10000)); // Commented out extracted text log

            // Step 2: 在拼接后的干净文本上匹配日记标记
            const dailyNoteRegex = /<<<DailyNoteStart>>>(.*?)<<<DailyNoteEnd>>>/s; // 使用严格的正则
            // console.log('[DailyNote Check] 在拼接文本上使用正则表达式:', dailyNoteRegex); // Commented out regex log
            const match = fullAiResponseText.match(dailyNoteRegex);

            if (match && match[1]) {
                const noteBlockContent = match[1].trim(); // 提取并去除首尾空白
                console.log('[DailyNote Check] 找到结构化日记标记，准备处理...'); // 简化找到标记的日志
                // 异步处理日记保存
                handleDailyNote(noteBlockContent).catch(err => {
                    console.error("处理结构化日记时发生未捕获错误:", err);
                });
            } else {
                 console.log('[DailyNote Check] 未找到结构化日记标记。'); // 简化未找到标记的日志
            }
            // --- 日记处理逻辑修改结束 ---

            // 原有的 JSON 解析逻辑已被包含在上面的 SSE 处理中或不再需要，故移除/注释
        });

        // 监听流错误
        response.body.on('error', (err) => {
            console.error('API 响应流错误:', err);
            // 尝试结束响应，如果尚未结束
            if (!res.writableEnded) {
                res.status(500).end('API response stream error');
            }
        });
        // --- 修改结束 ---

    } catch (error) {
        console.error('处理请求或转发时出错:', error);
        // 避免在已经发送头信息后再次发送错误 JSON
        if (!res.headersSent) {
             res.status(500).json({ error: 'Internal Server Error', details: error.message });
        } else {
             console.error("Headers already sent, cannot send error JSON.");
             // 尝试结束响应流，如果适用
             res.end();
        }
    }
});

// --- 初始化和定时任务 ---
async function initialize() {
    // 启动时更新并加载所有表情包列表
    await updateAndLoadGeneralEmojiList(); // 通用
    await updateAndLoadXiaoKeEmojiList();   // 小克
    await updateAndLoadXiaoJiEmojiList();   // 小吉
    await updateAndLoadXiaoBingEmojiList(); // 小冰
    await updateAndLoadXiaoNaEmojiList();   // 小娜
    await updateAndLoadXiaoYuEmojiList();   // 小雨
    await updateAndLoadXiaoJueEmojiList();  // 小绝

    // 启动时尝试加载一次缓存的天气信息
    try {
        cachedWeatherInfo = await fs.readFile(weatherInfoPath, 'utf-8');
        console.log(`从 ${weatherInfoPath} 加载了缓存的天气信息。`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`${weatherInfoPath} 文件不存在，将尝试首次获取天气信息。`);
            await fetchAndUpdateWeather(); // 如果文件不存在，立即获取一次
        } else {
            console.error(`读取天气文件 ${weatherInfoPath} 失败:`, error);
            cachedWeatherInfo = '读取天气缓存失败';
        }
    }

    // 安排每天凌晨4点更新天气
    schedule.scheduleJob('0 4 * * *', fetchAndUpdateWeather); // Cron 表达式：秒 分 时 日 月 周
    console.log('已安排每天凌晨4点自动更新天气信息。');

    // 启动时也获取一次天气（可选，上面已处理文件不存在的情况）
    // await fetchAndUpdateWeather();
}

// 启动服务器
app.listen(port, async () => {
    console.log(`中间层服务器正在监听端口 ${port}`);
    console.log(`API 服务器地址: ${apiUrl}`);
    await initialize(); // 初始化天气信息、表情包列表和定时任务
});