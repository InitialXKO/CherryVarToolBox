// server.js
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const schedule = require('node-schedule');
const lunarCalendar = require('chinese-lunar-calendar'); // 导入整个模块
const fs = require('fs').promises; // 使用 fs.promises 进行异步文件操作
const path = require('path');

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
const xiaoKeEmojiDir = path.join(__dirname, 'image', '小克表情包');
const xiaoJiEmojiDir = path.join(__dirname, 'image', '小吉表情包');
const xiaoBingEmojiDir = path.join(__dirname, 'image', '小冰表情包');

let cachedWeatherInfo = ''; // 用于缓存天气信息的变量
let cachedEmojiList = ''; // 新增：用于缓存表情包列表的变量
let cachedXiaoKeEmojiList = ''; // 新增：小克表情包列表缓存
let cachedXiaoJiEmojiList = ''; // 新增：小吉表情包列表缓存
let cachedXiaoBingEmojiList = ''; // 新增：小冰表情包列表缓存

// 中间件：解析 JSON 和 URL 编码的请求体，增加大小限制以支持大型 Base64 数据
app.use(express.json({ limit: '100mb' })); // 将 JSON 限制增加到 100MB
app.use(express.urlencoded({ limit: '100mb', extended: true })); // 将 URL 编码限制增加到 100MB

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

    // {{小克表情包}}
    processedText = processedText.replace(/\{\{小克表情包\}\}/g, cachedXiaoKeEmojiList || '小克表情包列表不可用');

    // {{小吉表情包}}
    processedText = processedText.replace(/\{\{小吉表情包\}\}/g, cachedXiaoJiEmojiList || '小吉表情包列表不可用');

    // {{小冰表情包}}
    processedText = processedText.replace(/\{\{小冰表情包\}\}/g, cachedXiaoBingEmojiList || '小冰表情包列表不可用');

    // {{EmojiPrompt}} - 动态生成通用 Emoji 提示
    if (processedText.includes('{{EmojiPrompt}}')) {
        let finalEmojiPrompt = '';
        if (emojiPromptTemplate) {
            finalEmojiPrompt = emojiPromptTemplate.replace(/\{\{EmojiList\}\}/g, cachedEmojiList || '表情包列表不可用');
        }
        // 使用正则表达式进行全局替换，以防模板中出现多个 {{EmojiPrompt}}
        processedText = processedText.replace(/\{\{EmojiPrompt\}\}/g, finalEmojiPrompt);
    }

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

        const response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: weatherModel,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            throw new Error(`获取天气失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        let weatherContent = data.choices?.[0]?.message?.content || '';
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

        // 将 API 服务器的响应体流式传输回客户端
        response.body.pipe(res);

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