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

let cachedWeatherInfo = ''; // 用于缓存天气信息的变量

// 中间件：解析 JSON 请求体
app.use(express.json());

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

// --- 变量替换逻辑 ---
async function replaceVariables(text) {
    let processedText = text;
    const now = new Date();

    // {{Date::time}}
    const dateTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    processedText = processedText.replace(/\{\{Date::time\}\}/g, dateTime);

    // {{Today}}
    const today = now.toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' });
    processedText = processedText.replace(/\{\{Today\}\}/g, today);

    // {{Festival}}
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // getMonth() 返回 0-11，需要加 1
    const day = now.getDate();
    const lunarDate = lunarCalendar.getLunar(year, month, day); // 传递年、月、日
    // console.log('Lunar Date Object:', lunarDate); // 移除调试日志
    let yearName = lunarDate.lunarYear.replace('年', ''); // 从 '乙巳年' 提取 '乙巳'
    let festivalInfo = `${yearName}${lunarDate.zodiac}年${lunarDate.dateStr}`; // 拼接成 "乙巳蛇年四月初三"
    if (lunarDate.solarTerm) { // 检查实际的节气属性 solarTerm
        festivalInfo += ` ${lunarDate.solarTerm}`;
    }
    // 移除了对 lunarFestival 和 solarFestival 的检查
    processedText = processedText.replace(/\{\{Festival\}\}/g, festivalInfo);

    // {{SystemInfo}}
    processedText = processedText.replace(/\{\{SystemInfo\}\}/g, systemInfo || '未配置系统信息');

    // {{WeatherInfo}}
    processedText = processedText.replace(/\{\{WeatherInfo\}\}/g, cachedWeatherInfo || '天气信息不可用');

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
        // 替换 Prompt 中的日期变量
        const now = new Date();
        const dateTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const prompt = weatherPromptTemplate.replace(/\{\{Date::time\}\}/g, dateTime);

        const response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: weatherModel,
                messages: [{ role: 'user', content: prompt }],
                // 根据需要添加其他参数，例如 temperature, max_tokens 等
                // 注意：这里假设 API 服务器支持直接调用并能处理 WebSearch
                // 可能需要根据实际 API 服务器的要求调整参数，特别是 function tool 相关部分
            }),
        });

        if (!response.ok) {
            throw new Error(`获取天气失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // 从返回结果中提取天气信息
        // 这部分需要根据你的 API 服务器实际返回的格式进行调整
        // 假设天气信息在 choices[0].message.content 中，并被 [WeatherInfo:...] 包裹
        let weatherContent = data.choices?.[0]?.message?.content || '';
        const match = weatherContent.match(/\[WeatherInfo:(.*?)\]/s); // 使用 s 标志使 . 匹配换行符
        if (match && match[1]) {
            cachedWeatherInfo = match[1].trim();
            console.log('天气信息已更新并缓存。');
            // 将天气信息写入文件
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

        // 递归处理请求体中的字符串变量
        async function processObject(obj) {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = await replaceVariables(obj[key]);
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    await processObject(obj[key]); // 递归处理嵌套对象
                }
            }
        }

        await processObject(originalBody); // 处理请求体

        // 转发请求到 API 服务器
        const response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // 使用 API 服务器的 Key
                // 保留客户端可能发送的其他相关 header，按需添加
                // 'User-Agent': req.headers['user-agent'],
            },
            body: JSON.stringify(originalBody), // 发送处理过的请求体
        });

        // 将 API 服务器的响应流式传输回客户端
        res.status(response.status);
        response.headers.forEach((value, name) => {
             // 避免传输 'content-encoding' 和 'transfer-encoding'，因为内容可能已更改
             // 也要避免设置我们自己的 'Authorization' 头
            if (!['content-encoding', 'transfer-encoding', 'authorization'].includes(name.toLowerCase())) {
                 res.setHeader(name, value);
            }
        });
        response.body.pipe(res);

    } catch (error) {
        console.error('处理请求或转发时出错:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- 初始化和定时任务 ---
async function initialize() {
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
    await initialize(); // 初始化天气信息和定时任务
});