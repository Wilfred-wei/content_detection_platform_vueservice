import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('../src/views/DetectionAgent.vue', import.meta.url))
const source = await readFile(componentPath, 'utf8')
const routerPath = fileURLToPath(new URL('../src/router/index.ts', import.meta.url))
const routerSource = await readFile(routerPath, 'utf8')

const requiredRenderingContracts = [
  ['provenance trust details', 'data-evidence-detail="provenance-trust"'],
  ['metadata authentication details', 'data-evidence-detail="metadata-authentication"'],
  ['exact watermark scheme details', 'data-evidence-detail="watermark-scheme"'],
  ['unexecuted coverage details', 'data-evidence-detail="coverage-state"'],
  ['material conflict section', 'data-report-section="evidence-conflicts"'],
  ['trusted provenance label', "return '已验证且受信任'"],
  ['unsigned metadata boundary', '未通过认证的 AIGC 元数据可被编辑'],
  ['closed verifier unavailable label', "unavailable: '无授权本地检测器'"],
  ['policy-disabled label', "disabled_policy: '当前策略禁用'"],
  ['model disabled neutrality', '模型策略未调用不代表图像为非 AI，也不属于模型检测失败。'],
  ['watermark unavailable neutrality', '该方案本次没有执行，因此不能解释为已确认水印不存在。'],
  ['not configured connection state', "return providerReady.value ? 'Pi 已连接' : '模型待配置'"],
  ['analysis retry control', 'analysis.error.retryable'],
]

for (const [name, marker] of requiredRenderingContracts) {
  assert.ok(source.includes(marker), `Missing Detection Agent rendering contract: ${name}`)
}

assert.ok(routerSource.includes("path: '/ai_image_detection/'"), 'Missing legacy route preservation')
assert.ok(routerSource.includes("path: '/detection-agent/image/'"), 'Missing Agent route preservation')

assert.match(
  source,
  /function evidenceSchemeLabel\(item: EvidenceRecord\)[\s\S]*?item\.facts\.schemeId[\s\S]*?item\.source/,
  'Exact scheme rendering must prefer the registered schemeId and fall back to the evidence source',
)
assert.match(
  source,
  /function metadataAuthenticationLabel\(item: EvidenceRecord\)[\s\S]*?authenticated === true[\s\S]*?未认证，仅辅助/,
  'Metadata rendering must distinguish authenticated and unsigned supporting evidence',
)
assert.match(
  source,
  /function isUnattemptedCoverage\(item: EvidenceRecord\)[\s\S]*?detectionAttempted === false/,
  'Unavailable and policy-disabled coverage must stay separate from executed not-detected evidence',
)

console.log('Detection Agent evidence presentation contract passed')
