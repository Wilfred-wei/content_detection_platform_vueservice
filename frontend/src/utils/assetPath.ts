/**
 * 静态资源路径工具函数
 * 用于处理 Vite base 路径配置下的静态资源引用
 */

/**
 * 获取静态资源完整路径
 * @param path 相对于 public 目录的路径（如 '/static/videos/test.mp4'）
 * @returns 完整的资源路径（包含 base 前缀）
 */
export function getAssetPath(path: string): string {
  // 移除开头的斜杠以避免双斜杠
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  // 使用 import.meta.env.BASE_URL 获取基础路径
  const basePath = import.meta.env.BASE_URL || '/'
  // 确保基础路径以斜杠结尾
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${normalizedBase}${cleanPath}`
}

/**
 * 获取示例视频路径
 * @param filename 视频文件名
 * @returns 完整的视频路径
 */
export function getVideoPath(filename: string): string {
  return getAssetPath(`/static/videos/${filename}`)
}

/**
 * 获取示例图片路径
 * @param category 图片分类（如 'rumor', 'real_img', 'fake_img' 等）
 * @param filename 图片文件名
 * @param encode 是否对文件名进行 URL 编码（默认 true，用于处理特殊字符）
 * @returns 完整的图片路径
 */
export function getExampleImagePath(category: string, filename: string, encode: boolean = true): string {
  const processedFilename = encode ? encodeURIComponent(filename) : filename
  return getAssetPath(`/examples/${category}/${processedFilename}`)
}

/**
 * 获取静态图片路径
 * @param filename 图片文件名
 * @returns 完整的图片路径
 */
export function getStaticImagePath(filename: string): string {
  return getAssetPath(`/static/images/${filename}`)
}
