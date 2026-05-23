// 这个文件会被 esbuild 打包成 www/vendor.js (IIFE)
// 把 Capacitor 插件挂到 window，给 app.js 直接用
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

window.Capacitor = Capacitor;
window.LocalNotifications = LocalNotifications;
