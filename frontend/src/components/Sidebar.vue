<template>
  <aside class="sidebar">
    <h3>功能模块</h3>
    <ul>
      <li>
        <router-link to="/rumor_detection/">图文谣言检测</router-link>
      </li>
      <li class="dropdown">
        <a href="#" class="dropdown-toggle" @click="toggleDropdown" :class="{ active: showDropdown }">
          视频分析
        </a>
        <ul class="submenu" :class="{ show: showDropdown }">
          <li><router-link to="/video_analysis/module1/">有害视频检测</router-link></li>
          <li><router-link to="/video_analysis/module2/">视频语义理解</router-link></li>
          <li><router-link to="/video_analysis/module3/">有害视频检测数据集</router-link></li>
        </ul>
      </li>
      <li>
        <router-link to="/ai_image_detection/">AI生成图片检测</router-link>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const showDropdown = ref(true)

const toggleDropdown = (e: Event) => {
  e.preventDefault()
  showDropdown.value = !showDropdown.value
}
</script>

<style scoped>
.sidebar {
  width: 100%;
  height: 100%;
  padding: 20px;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  /* 移除所有定位和高度设置，让父容器控制 */
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .sidebar {
    padding: 15px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    border-right: none;
    border-bottom: 1px solid #ddd;
    padding: 15px;
  }
}

@media (max-width: 576px) {
  .sidebar {
    padding: 10px;
  }
}

.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sidebar h3 {
  font-size: 22px;
  margin-bottom: 15px;
  font-weight: bold;
}

.sidebar > ul > li {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  cursor: pointer;
  transition: 0.3s;
  text-align: left;
}

.sidebar .dropdown {
  padding: 0 !important;
  background: none !important;
  position: relative;
}

.sidebar .dropdown > .dropdown-toggle {
  padding: 12px;
  display: block;
  width: 100%;
}

.sidebar > ul > li:not(.dropdown):has(.router-link-active),
.sidebar > ul > li:not(.dropdown):has(.router-link-exact-active) {
  background: #3b87d8 !important;
  color: white !important;
  font-weight: bold;
}

/* 为非下拉菜单的直接链接添加选中状态 */
.sidebar > ul > li:not(.dropdown) .router-link-active,
.sidebar > ul > li:not(.dropdown) .router-link-exact-active {
  background: transparent !important;
  color: inherit !important;
  font-weight: bold;
}



.sidebar > ul > li:not(.dropdown):hover {
  background: #3b87d8;
  color: white;
}

.sidebar .dropdown:hover > .dropdown-toggle {
  background-color: rgba(59, 135, 216, 0.1);
  border-radius: 5px;
  transition: background-color 0.3s ease;
}

.sidebar .dropdown:hover {
  background: none !important;
  color: inherit !important;
}

.sidebar a {
  text-decoration: none;
  color: inherit;
  display: block;
  width: 100%;
  height: 100%;
}

.sidebar .dropdown-toggle {
  cursor: pointer;
  position: relative;
  width: 100%;
  background: none !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.sidebar .dropdown-toggle::after {
  content: "";
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #333;
  transition: transform 0.3s ease;
}

.sidebar .dropdown-toggle.active::after {
  transform: translateY(-50%) rotate(180deg);
}

.sidebar .submenu {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
  background: rgba(255, 255, 255, 0.1);
}

.sidebar .submenu.show {
  max-height: 200px;
}

.sidebar .submenu li {
  padding: 8px 0 8px 20px;
  margin: 0;
  border-left: 2px solid transparent;
  transition: all 0.3s ease;
  font-size: 14px;
}

.sidebar .submenu li:hover {
  background: rgba(59, 135, 216, 0.1);
  border-left-color: #3b87d8;
}

/* 子菜单项选中状态 */
.sidebar .submenu li:has(.router-link-active),
.sidebar .submenu li:has(.router-link-exact-active) {
  background: #3b87d8 !important;
  color: white !important;
  border-left-color: #3b87d8 !important;
}

.sidebar .submenu .router-link-active,
.sidebar .submenu .router-link-exact-active {
  background: transparent !important;
  color: inherit !important;
}

/* 确保下拉菜单容器不会因为子项选中而变色 */
.sidebar .dropdown {
  background: none !important;
}

.sidebar .dropdown .dropdown-toggle {
  background: none !important;
  color: inherit !important;
}

.sidebar .submenu a {
  text-decoration: none;
  color: inherit;
  display: block;
  padding: 5px 10px;
  border-radius: 3px;
}

.sidebar .submenu li:hover a {
  color: inherit;
}


</style> 