<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
      <div class="container-fluid">
        <a class="navbar-brand d-flex align-items-center" href="/">
          <img src="/static/images/logo.png" alt="Logo" />
          <div class="nav-title">多模态数据分类平台</div>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-end" id="navbarNav">
          <ul class="navbar-nav me-3">
            <li class="nav-item"><router-link class="nav-link text-muted-blue" to="/">首页</router-link></li>
            <li class="nav-item"><a class="nav-link text-muted-blue" href="#">产品</a></li>
            <li class="nav-item"><a class="nav-link text-muted-blue" href="#">解决方案</a></li>
            <li class="nav-item"><a class="nav-link text-muted-blue" href="#">关于我们</a></li>
          </ul>
        </div>
      </div>
    </nav>

    <!-- 页面主体 -->
    <router-view />
  </div>
</template>

<script setup lang="ts">
// 无需额外逻辑
</script>

<style>
/* 全局样式 */
body {
  font-family: 'Arial', sans-serif;
  background: #f5f7fa;
  margin: 0;
  padding: 0;
  color: #333;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.app {
  min-height: 100vh;
}

/* 导航栏样式复制自Django版本 */
.navbar {
  background: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 30px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.nav-title {
  font-size: 36px;
  font-weight: bold;
  color: #0056b3;
}

.nav-logo {
  font-size: 60px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #0056b3, #007bff);
  border-radius: 50%;
  box-shadow: 0 4px 15px rgba(0, 86, 179, 0.3);
}

.nav-links a {
  color: #0056b3;
  text-decoration: none;
  font-size: 18px;
  transition: 0.3s;
}

.nav-links a:hover {
  color: #ffcc00;
  border-bottom: 3px solid #ffcc00;
  padding-bottom: 5px;
}

/* 取消推荐视频获取的默认选中状态 */
.nav-item .active {
  background: none !important;
  color: inherit !important;
}
</style> 