/**
 * 抖音采集助手 - Popup 交互逻辑
 */

// DOM 元素
const pageStatus = document.getElementById('pageStatus');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const notDouyinTip = document.getElementById('notDouyinTip');
const mainPanel = document.getElementById('mainPanel');
const likeThresholdInput = document.getElementById('likeThreshold');
const extractBtn = document.getElementById('extractBtn');
const resultsArea = document.getElementById('resultsArea');
const resultsCount = document.getElementById('resultsCount');
const resultsList = document.getElementById('resultsList');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

// 存储采集结果
let collectedVideos = [];

// 格式化数字显示
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

// 显示状态提示
function showStatus(type, message) {
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
}

// 初始化：检测当前页面
async function init() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 检查是否为抖音页面
        if (!tab.url || !tab.url.includes('douyin.com')) {
            showNotDouyinPage();
            return;
        }

        // 检查是否为博主主页
        const isUserPage = tab.url.includes('/user/');

        if (isUserPage) {
            // 向 content script 发送消息获取页面信息
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
                if (response && response.success) {
                    showDouyinUserPage(response.authorName || '博主');
                } else {
                    showDouyinUserPage('博主');
                }
            } catch (e) {
                // content script 可能还未加载，显示基本信息
                showDouyinUserPage('博主');
            }
        } else {
            statusTitle.textContent = '请进入博主主页';
            statusDesc.textContent = '当前页面不是博主主页';
            pageStatus.classList.add('error');
            mainPanel.style.display = 'block';
            extractBtn.disabled = true;
            extractBtn.textContent = '⚠️ 请进入博主主页';
        }

    } catch (error) {
        console.error('初始化失败:', error);
        showNotDouyinPage();
    }
}

// 显示非抖音页面
function showNotDouyinPage() {
    pageStatus.style.display = 'none';
    mainPanel.style.display = 'none';
    notDouyinTip.style.display = 'block';
}

// 显示抖音用户页面
function showDouyinUserPage(authorName) {
    statusTitle.textContent = `@${authorName} 的主页`;
    statusDesc.textContent = '点击下方按钮开始采集视频';
    pageStatus.classList.add('success');
    mainPanel.style.display = 'block';
    notDouyinTip.style.display = 'none';
}

// 验证点赞阈值输入
function validateThreshold() {
    const value = likeThresholdInput.value.trim();
    if (value === '') return true; // 空值允许

    const num = parseInt(value);
    if (isNaN(num) || num < 0 || !Number.isInteger(parseFloat(value))) {
        return false;
    }
    return true;
}

// 开始采集
async function startExtract() {
    // 验证输入
    if (!validateThreshold()) {
        showStatus('error', '请输入有效的正整数');
        return;
    }

    extractBtn.disabled = true;
    extractBtn.textContent = '⏳ 采集中...';
    showStatus('loading', '正在读取页面视频数据...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 向 content script 发送消息提取视频
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractVideos' });

        if (!response || !response.success) {
            throw new Error(response?.error || '提取视频数据失败');
        }

        let videos = response.videos || [];

        // 应用点赞阈值筛选
        const threshold = likeThresholdInput.value.trim();
        if (threshold !== '') {
            const minLikes = parseInt(threshold);
            videos = videos.filter(v => v.likes >= minLikes);
        }

        collectedVideos = videos;

        // 显示结果
        displayResults(videos);

    } catch (error) {
        console.error('采集失败:', error);
        showStatus('error', `采集失败: ${error.message}`);
    } finally {
        extractBtn.disabled = false;
        extractBtn.textContent = '🔍 开始采集';
    }
}

// 显示采集结果
function displayResults(videos) {
    if (videos.length === 0) {
        showStatus('error', '未找到符合条件的视频');
        resultsArea.style.display = 'none';
        saveBtn.style.display = 'none';
        return;
    }

    resultsArea.style.display = 'block';
    saveBtn.style.display = 'block';
    resultsCount.textContent = `${videos.length} 个视频`;

    // 渲染视频列表
    resultsList.innerHTML = videos.map((video, index) => `
    <div class="result-item">
      <span class="result-item__title" title="${video.title}">
        ${index + 1}. ${video.title || '无标题'}
      </span>
      <span class="result-item__likes">
        ${formatNumber(video.likes)} 赞
      </span>
    </div>
  `).join('');

    showStatus('success', `成功采集 ${videos.length} 个视频`);
}

// 保存到飞书
async function saveToFeishu() {
    if (collectedVideos.length === 0) {
        showStatus('error', '没有可保存的视频');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ 保存中...';
    showStatus('loading', '正在保存到飞书表格...');

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'saveToFeishu',
            videos: collectedVideos
        });

        if (response.success) {
            showStatus('success', `✅ 已保存 ${collectedVideos.length} 条记录到飞书表格`);
            saveBtn.textContent = '✓ 已保存';

            // 3秒后恢复
            setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 保存到飞书表格';
            }, 3000);
        } else {
            throw new Error(response.error || '保存失败');
        }

    } catch (error) {
        console.error('保存失败:', error);
        showStatus('error', `保存失败: ${error.message}`);
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 保存到飞书表格';
    }
}

// 限制输入只能是正整数
likeThresholdInput.addEventListener('input', (e) => {
    let value = e.target.value;
    // 移除非数字字符
    value = value.replace(/[^\d]/g, '');
    // 移除前导零
    if (value.length > 1 && value.startsWith('0')) {
        value = value.replace(/^0+/, '');
    }
    e.target.value = value;
});

// 绑定事件
extractBtn.addEventListener('click', startExtract);
saveBtn.addEventListener('click', saveToFeishu);

// 初始化
init();
