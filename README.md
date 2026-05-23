# 英语老师课程管理 App

一个面向英语老师的本地课程管理工具，无需服务器，数据全部存储在手机本地，支持打包为 Android APK。

## 功能

- **课程管理**：添加 / 编辑 / 删除课程，支持按状态筛选和时间排序
- **学生管理**：独立管理学生信息，点击学生查看其全部课程记录
- **日历视图**：月视图选择日期查看课程，周视图以时间表形式展示一周安排
- **周视图**：左侧时间列 + 顶部日期栏，课程块按时间精确定位，长按拖拽多选时间段快速添加
- **统计面板**：课程总数、已完成、待上课、总收入、本月计划收入 / 实际收入
- **重复课程**：支持每周同一时间自动生成多周课程
- **提醒通知**：前一晚 8:00 提醒明天有课 + 上课前 1 小时提醒
- **快速切换**：课程卡片上直接切换「待上课 / 已完成」和「反馈已发 / 反馈未发」
- **自动计费**：按 70 元 / 小时自动计算课程费用

## 使用方式

### 电脑端预览

```bash
cd www
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

### 手机端安装

1. 将本仓库推送到 GitHub，GitHub Actions 自动构建 APK
2. 在 Actions 页面下载 `app-debug.apk`
3. 传到小米手机，开启「允许安装未知来源」后安装

## 技术栈

- 纯 HTML / CSS / JavaScript（无框架）
- IndexedDB 本地数据存储
- Capacitor 打包为 Android APK
- Web Notification API 推送提醒
- Capacitor Local Notifications 插件（APK 内通知）

## 构建

```bash
npm install
npx cap sync android
# 用 Android Studio 打开 android/ 目录编译 APK
```

或直接 `git push`，由 GitHub Actions 云端编译。
