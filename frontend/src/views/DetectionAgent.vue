<template>
  <div class="agent-page">
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>

    <main class="agent-main">
      <header class="agent-header">
        <div>
          <h1>AI 图像检测对话</h1>
          <p>上传图片，由 Agent 完成检测、分析与连续问答</p>
        </div>
        <div class="agent-header-actions">
          <div class="connection-state" :class="connectionClass">
            <span class="state-dot" aria-hidden="true"></span>
            {{ connectionLabel }}
          </div>
          <button v-if="analysis" class="icon-button" type="button" title="新建对话" aria-label="新建检测对话" :disabled="loading || analysisSubmitting" @click="resetWorkspace">
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
          <button class="icon-button" type="button" title="模型连接配置" aria-label="打开模型连接配置" @click="openConfiguration">
            <i class="fas fa-gear" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="agent-workspace">
        <section class="status-panel" aria-label="Agent 状态">
          <div class="status-section">
            <h2>运行状态</h2>
            <dl>
              <div>
                <dt>服务</dt>
                <dd>{{ health?.status === 'healthy' ? '在线' : '未连接' }}</dd>
              </div>
              <div>
                <dt>提供方</dt>
                <dd>{{ health?.pi.provider || '--' }}</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>{{ health?.pi.model || '--' }}</dd>
              </div>
            </dl>
          </div>

          <div class="status-section">
            <h2>能力</h2>
            <div class="capability-row">
              <span>通用会话</span>
              <span class="status-tag" :class="providerReady ? 'ready' : 'pending'">
                {{ providerReady ? '可用' : '待配置' }}
              </span>
            </div>
            <div class="capability-row">
              <span>AI生成图像检测</span>
              <span class="status-tag ready">框架可用</span>
            </div>
          </div>

          <button class="secondary-button" type="button" :disabled="loading || analysisSubmitting" @click="resetWorkspace" title="新建对话">
            <i class="fas fa-rotate-right" aria-hidden="true"></i>
            新建对话
          </button>
        </section>

        <div class="right-workspace">
          <section class="analysis-panel unified-conversation" aria-label="AI生成图像检测对话">
            <header class="conversation-toolbar">
              <div class="conversation-identity">
                <span class="agent-mark" aria-hidden="true"><i class="fas fa-image"></i></span>
                <div>
                  <span>图像取证</span>
                  <strong>{{ analysis ? '当前检测会话' : '新建检测会话' }}</strong>
                </div>
              </div>
              <div class="conversation-mode">
                <i class="fas fa-shield-halved" aria-hidden="true"></i>
                <span>{{ analysis ? '证据审查中' : '等待图像' }}</span>
              </div>
            </header>

            <div v-if="!analysis && !selectedFile" class="empty-state conversation-empty">
              <span class="empty-mark" aria-hidden="true"><i class="fas fa-image"></i></span>
              <span class="empty-eyebrow">AI IMAGE REVIEW</span>
              <h2>开始一项图像审查</h2>
              <p>上传图像后，检测过程、结论与追问将在当前会话中持续保留。</p>
              <div class="empty-status-row" aria-hidden="true">
                <span><i class="fas fa-circle-check"></i> 会话已就绪</span>
                <span><i class="fas fa-lock"></i> 本次检测独立记录</span>
              </div>
            </div>

            <div v-if="analysis" class="analysis-result conversation-transcript">
              <article class="message user image-message">
                <div class="message-meta">你</div>
                <div class="message-content">
                  <img v-if="previewUrl && !analysis.assetDeletedAt" :src="previewUrl" alt="已提交的检测图像">
                  <span v-else-if="analysis.assetDeletedAt" class="asset-deleted-note">原始图像已按保留策略删除，仅保留检测报告与审计摘要。</span>
                  <span>{{ submittedPrompt }}</span>
                </div>
              </article>
              <article class="message assistant analysis-message">
                <div class="message-meta">Agent</div>
                <div class="message-content analysis-message-content">
                  <header class="analysis-result-header">
                    <div class="report-heading">
                      <div class="report-heading-meta">
                        <span class="analysis-state" :class="analysis.state">{{ analysisStateLabel }}</span>
                        <span class="analysis-id">#{{ analysis.id.slice(-8) }}</span>
                      </div>
                      <h2>{{ analysis.state === 'completed' ? 'AI 图像检测报告' : '正在分析图片' }}</h2>
                      <p>{{ analysis.asset.filename }}</p>
                    </div>
                    <span class="report-type"><i class="fas fa-file-shield" aria-hidden="true"></i> 检测记录</span>
                    <button
                      v-if="analysis.state === 'queued' || analysis.state === 'running'"
                      class="icon-button analysis-cancel-button"
                      type="button"
                      title="取消分析"
                      aria-label="取消分析"
                      :disabled="analysisCancelling"
                      @click="cancelCurrentAnalysis"
                    >
                      <i :class="analysisCancelling ? 'fas fa-circle-notch fa-spin' : 'fas fa-stop'" aria-hidden="true"></i>
                    </button>
                  </header>

                  <div class="stage-list" aria-label="分析阶段">
                    <div v-for="stage in analysis.stages" :key="stage.id" class="stage-row">
                      <i :class="stageIcon(stage.state)" aria-hidden="true"></i>
                      <div><strong>{{ stage.label }}</strong><span v-if="stage.reason">{{ stage.reason }}</span></div>
                      <span>{{ stageStateLabel(stage.state) }}</span>
                    </div>
                  </div>

              <template v-if="report">
                <section v-if="displayProductDecision" class="ai-assessment-report" :class="displayProductDecision.verdict.toLowerCase()">
                  <header>
                    <div>
                      <span>AI 多模态综合判断</span>
                      <h2>{{ verdictLabel(displayProductDecision.verdict) }}</h2>
                    </div>
                    <strong>{{ confidenceBandLabel(displayProductDecision.confidenceBand) }}置信度</strong>
                  </header>
                  <small class="assessment-authority">AI 综合裁决 · 专用检测模型为高权重证据 · 不代表已验证来源凭证</small>
                  <p>{{ report.aiAssessment?.reconciled.summary || report.explanation }}</p>
                  <div v-if="report.aiAssessment" class="assessment-columns">
                    <div>
                      <h3>判断理由</h3>
                      <ul><li v-for="reason in report.aiAssessment.reconciled.reasons" :key="reason.id">{{ reason.claim }}</li></ul>
                      <p v-if="!report.aiAssessment.reconciled.reasons.length">最终结论主要依据已引用的结构化检测证据。</p>
                    </div>
                    <div>
                      <h3>反向证据与质疑</h3>
                      <ul><li v-for="item in report.aiAssessment.reconciled.counterEvidence" :key="item">{{ item }}</li></ul>
                      <p v-if="!report.aiAssessment.reconciled.counterEvidence.length">未记录明确的反向证据</p>
                    </div>
                  </div>
                  <details v-if="report.aiAssessment?.critic">
                    <summary>查看独立质疑结果</summary>
                    <p>{{ report.aiAssessment.critic.summary }}</p>
                    <small>质疑结果仅用于检查理由，不拥有最终结论否决权。</small><br>
                    <small>{{ report.aiAssessment.provider }} / {{ report.aiAssessment.model }} · {{ report.aiAssessment.promptBundle.id }} {{ report.aiAssessment.promptBundle.version }}</small>
                  </details>
                  <div v-if="report.aiAssessment?.reconciled.limitations.length" class="assessment-limitations">
                    <strong>判断边界</strong>
                    <ul><li v-for="item in report.aiAssessment.reconciled.limitations" :key="item">{{ item }}</li></ul>
                  </div>
                </section>
                <section class="decision-block" :class="(report.provenanceConclusion || report.decision).verdict.toLowerCase()">
                  <div>
                    <span>来源凭证结论</span>
                    <h2>{{ provenanceVerdictLabel((report.provenanceConclusion || report.decision).verdict) }}</h2>
                    <small>仅表示水印、签名和来源凭证是否建立，不替代 AI 生成判断。</small>
                  </div>
                </section>

                <section class="report-section">
                  <h3>结论依据</h3>
                  <p>{{ report.explanation }}</p>
                  <p class="synthesis-meta">
                    <template v-if="report.synthesis.outputType !== 'deterministic_fallback'">
                      由 {{ report.synthesis.provider }} / {{ report.synthesis.model }} 基于结构化证据生成并复核
                    </template>
                    <template v-else>AI 文本未通过复核，当前展示确定性回退说明</template>
                    · {{ report.synthesis.attempts || 1 }} 次生成
                  </p>
                  <p v-if="report.synthesis.promptBundle" class="synthesis-meta">
                    解释 Bundle：{{ report.synthesis.promptBundle.id }} / {{ report.synthesis.promptBundle.version }}
                    · {{ promptBundleStatusLabel(report.synthesis.promptBundle.evaluationStatus) }}
                  </p>
                  <ul><li v-for="basis in displayProductDecision?.basis || []" :key="basis">{{ basis }}</li></ul>
                </section>

                <section v-if="displayProductDecision?.conflicts.length" class="report-section conflicts-section" data-report-section="evidence-conflicts">
                  <h3>证据冲突</h3>
                  <ul><li v-for="conflict in displayProductDecision.conflicts" :key="conflict">{{ conflict }}</li></ul>
                </section>

                <section class="report-section validation-section">
                  <h3>解释复核</h3>
                  <div class="validation-summary">
                    <span>{{ validationStatusLabel(report.validation.status) }}</span>
                    <small v-if="report.validation.validator">
                      {{ report.validation.validator.provider }} / {{ report.validation.validator.model }}
                    </small>
                  </div>
                  <details class="validation-details">
                    <summary>查看 {{ report.validation.checks.length }} 项精确与极性校验</summary>
                    <div v-for="check in report.validation.checks" :key="check.id" class="validation-check" :class="check.outcome">
                      <i :class="check.passed ? 'fas fa-circle-check' : check.outcome === 'unverifiable' ? 'fas fa-circle-question' : 'fas fa-circle-xmark'" aria-hidden="true"></i>
                      <div>
                        <strong>{{ validationCheckLabel(check.method) }}</strong>
                        <span>{{ check.question || check.detail }}</span>
                        <small v-if="check.answer">回答：{{ check.answer }}</small>
                      </div>
                    </div>
                  </details>
                </section>

                <section v-if="report.forensicInspection" class="report-section multimodal-policy-section">
                  <h3>多模态调查配置</h3>
                  <p class="visual-validation-note">视觉模型只收集和复核支持性线索，不直接决定图像来源。</p>
                  <dl class="localization-metrics">
                    <div><dt>提示词 Bundle</dt><dd>{{ report.forensicInspection.promptBundle?.id || '--' }}</dd></div>
                    <div><dt>版本</dt><dd>{{ report.forensicInspection.promptBundle?.version || '--' }}</dd></div>
                    <div><dt>线索分类</dt><dd>{{ report.forensicInspection.promptBundle?.cueTaxonomyVersion || '--' }}</dd></div>
                    <div><dt>评估状态</dt><dd>{{ promptBundleStatusLabel(report.forensicInspection.promptBundle?.evaluationStatus) }}</dd></div>
                    <div><dt>受控调用</dt><dd>{{ report.forensicInspection.callsUsed }}</dd></div>
                    <div><dt>调查轮次</dt><dd>{{ report.forensicInspection.roundsUsed }}</dd></div>
                  </dl>
                </section>

                <section v-if="report.forensicInspection?.visualValidations.length" class="report-section validation-section">
                  <h3>视觉声明复核</h3>
                  <p class="visual-validation-note">这些结果只校验可见线索是否稳定，不会单独改变检测结论。</p>
                  <details v-for="validation in report.forensicInspection.visualValidations" :key="validation.id" class="validation-details">
                    <summary>
                      <span>{{ validation.claim }}</span>
                      <span class="visual-validation-status" :class="validation.status">{{ visualValidationOutcomeLabel(validation.status) }}</span>
                    </summary>
                    <div class="visual-consistency-row">
                      <span>问法一致性：{{ visualConsistencyLabel(validation.polarityConsistency) }}</span>
                      <span>视图一致性：{{ visualConsistencyLabel(validation.viewConsistency) }}</span>
                    </div>
                    <div v-for="check in validation.checks" :key="check.id" class="validation-check" :class="check.outcome">
                      <i :class="check.outcome === 'supported' ? 'fas fa-circle-check' : check.outcome === 'contradicted' ? 'fas fa-circle-xmark' : 'fas fa-circle-question'" aria-hidden="true"></i>
                      <div>
                        <strong>{{ visualQuestionLabel(check.variant) }} · {{ check.view === 'crop' ? '局部视图' : '原始视图' }}</strong>
                        <span>{{ check.description }}</span>
                        <small>{{ check.provider }} / {{ check.model }}</small>
                      </div>
                    </div>
                  </details>
                </section>

                <section v-if="report.forensicInspection?.visibleMarks?.length" class="report-section visible-mark-section">
                  <h3>可见 AI 标识</h3>
                  <p class="visual-validation-note">这里只确认标识是否出现在画面中。文字、徽标和披露标签都可能被复制、移除或伪造，不能验证厂商身份或图像来源。</p>
                  <details v-for="mark in report.forensicInspection.visibleMarks" :key="mark.id" class="visible-mark-details" :open="mark.status === 'supported'">
                    <summary>
                      <span>{{ visibleMarkTypeLabel(mark.markType) }}</span>
                      <span class="visual-validation-status" :class="mark.status">{{ visibleMarkStatusLabel(mark.status) }}</span>
                    </summary>
                    <p>{{ mark.description }}</p>
                    <dl class="localization-metrics">
                      <div><dt>可见文字</dt><dd>{{ mark.visibleText || '--' }}</dd></div>
                      <div><dt>声称厂商</dt><dd>{{ mark.claimedProvider ? `${mark.claimedProvider}（未验证）` : '--' }}</dd></div>
                      <div><dt>独立复核</dt><dd>{{ mark.verificationOutcome === 'not_run' ? '未运行' : visualValidationOutcomeLabel(mark.verificationOutcome) }}</dd></div>
                      <div v-if="mark.region"><dt>位置</dt><dd>{{ formatRegion(mark.region) }}</dd></div>
                      <div><dt>模型</dt><dd>{{ mark.provider }} / {{ mark.model }}</dd></div>
                      <div><dt>证据权限</dt><dd>仅辅助</dd></div>
                    </dl>
                    <p v-if="mark.status === 'supported'" class="visible-mark-warning">
                      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                      标识存在已复核，但标识内容的真实性、厂商身份和生成器归属均未验证。
                    </p>
                  </details>
                </section>

                <section v-if="report.forensicInspection?.localization?.artifacts.length" class="report-section localization-section">
                  <h3>条件定位</h3>
                  <p class="visual-validation-note">区域仅标注已通过一致性复核的可见线索，用于展示和复查，不能单独证明 AI 生成或图像篡改。</p>
                  <div v-if="previewUrl" class="localization-preview">
                    <img :src="previewUrl" alt="带条件定位区域的原图">
                    <span
                      v-for="artifact in report.forensicInspection.localization.artifacts"
                      :key="artifact.id"
                      class="localization-box"
                      :style="localizationStyle(artifact.region)"
                      aria-hidden="true"
                    ></span>
                  </div>
                  <details v-for="artifact in report.forensicInspection.localization.artifacts" :key="artifact.id" class="localization-details">
                    <summary>
                      <span>{{ artifact.description }}</span>
                      <span>辅助区域</span>
                    </summary>
                    <dl class="localization-metrics">
                      <div><dt>位置</dt><dd>{{ formatRegion(artifact.region) }}</dd></div>
                      <div><dt>区域一致度</dt><dd>{{ Math.round(artifact.overlapRatio * 100) }}%</dd></div>
                      <div><dt>模型</dt><dd>{{ artifact.provider }} / {{ artifact.model }}</dd></div>
                    </dl>
                  </details>
                </section>

                <section class="report-section">
                  <h3>证据与覆盖</h3>
                  <h4 class="evidence-group-title">已执行的检测</h4>
                  <details v-for="item in executedEvidence" :key="item.id" class="evidence-item">
                    <summary>
                      <span>{{ evidenceCategoryLabel(item.category) }}</span>
                      <span class="evidence-status" :class="item.status">{{ evidenceStatusLabel(item) }}</span>
                    </summary>
                    <p>{{ item.summary }}</p>
                    <dl v-if="item.source === 'c2pa'" class="evidence-metrics" data-evidence-detail="provenance-trust">
                      <div><dt>凭证方案</dt><dd>C2PA</dd></div>
                      <div><dt>信任结论</dt><dd>{{ c2paTrustLabel(item) }}</dd></div>
                      <div><dt>声明签发者</dt><dd>{{ item.facts.issuer || '--' }}</dd></div>
                      <div><dt>验证状态</dt><dd>{{ item.facts.validationState || '未建立' }}</dd></div>
                      <div><dt>AI 来源声明</dt><dd>{{ c2paOriginLabel(item.facts.aiOrigin) }}</dd></div>
                      <div><dt>校验问题</dt><dd>{{ item.facts.validationStatusCount }}</dd></div>
                    </dl>
                    <p v-if="item.source === 'c2pa' && item.facts.validationCodes" class="validation-issues">
                      校验项：{{ item.facts.validationCodes }}
                    </p>
                    <dl v-if="item.source === 'gb-45438-2025'" class="evidence-metrics" data-evidence-detail="metadata-authentication">
                      <div><dt>元数据标准</dt><dd>{{ item.facts.standard || 'GB 45438-2025' }}</dd></div>
                      <div><dt>认证结论</dt><dd>{{ metadataAuthenticationLabel(item) }}</dd></div>
                      <div><dt>标记数量</dt><dd>{{ item.facts.markerCount }}</dd></div>
                      <div><dt>声明生产方</dt><dd>{{ item.facts.contentProducer || '--' }}</dd></div>
                      <div><dt>认证签发者</dt><dd>{{ item.facts.issuer || '--' }}</dd></div>
                      <div><dt>字段冲突</dt><dd>{{ item.facts.conflict === true ? '存在' : '未发现' }}</dd></div>
                    </dl>
                    <p v-if="item.source === 'gb-45438-2025' && metadataNeedsAuthenticationWarning(item)" class="validation-issues metadata-authentication-warning">
                      未通过认证的 AIGC 元数据可被编辑，只作为支持性或异常线索，不作为已验证来源凭证。
                    </p>
                    <dl v-if="item.category === 'watermark'" class="evidence-metrics" data-evidence-detail="watermark-scheme">
                      <div><dt>精确方案</dt><dd>{{ evidenceSchemeLabel(item) }}</dd></div>
                      <div><dt>检测器</dt><dd>{{ item.source }}</dd></div>
                      <div><dt>执行结论</dt><dd>{{ evidenceStatusLabel(item) }}</dd></div>
                      <div v-if="typeof item.facts.attemptedViews === 'number'"><dt>尝试视图</dt><dd>{{ item.facts.attemptedViews }}</dd></div>
                      <div v-if="typeof item.facts.latencyMs === 'number'"><dt>耗时</dt><dd>{{ formatLatency(item.facts.latencyMs) }}</dd></div>
                    </dl>
                    <dl v-if="item.category === 'model' && typeof item.facts.score === 'number'" class="evidence-metrics model-metrics">
                      <div><dt>检测器</dt><dd>{{ item.source }}</dd></div>
                      <div><dt>AI 生成分数</dt><dd>{{ formatScore(item.facts.score) }}</dd></div>
                      <div><dt>发布阈值</dt><dd>{{ formatScore(item.facts.threshold) }}</dd></div>
                      <div><dt>模型方向</dt><dd>{{ modelDirectionLabel(item.facts.predictedClass) }}</dd></div>
                      <div><dt>预处理</dt><dd>{{ item.facts.preprocessingId }}</dd></div>
                      <div><dt>权重摘要</dt><dd>{{ formatDigest(item.facts.checkpointSha256) }}</dd></div>
                      <div><dt>推理耗时</dt><dd>{{ formatLatency(item.facts.latencyMs) }}</dd></div>
                    </dl>
                    <p v-if="item.category === 'model' && item.facts.calibrationStatus === 'official_threshold_unverified_for_deployment'" class="validation-issues">
                      使用论文官方阈值，尚未完成本站部署域校准；该结果仅作为支持性证据。
                    </p>
                    <p v-if="item.category === 'model' && item.facts.calibrationStatus === 'experimental_threshold_unverified_for_deployment'" class="validation-issues">
                      MIRROR 为实验性辅助检测，许可与本站部署域校准均未完成，不参与生产裁决。
                    </p>
                    <small>{{ item.source }}</small>
                  </details>
                  <template v-if="coverageEvidence.length">
                    <h4 class="evidence-group-title coverage-title">未执行的覆盖项</h4>
                    <details v-for="item in coverageEvidence" :key="item.id" class="evidence-item coverage-item">
                      <summary>
                        <span>{{ item.source }}</span>
                        <span class="evidence-status" :class="item.status">{{ evidenceStatusLabel(item) }}</span>
                      </summary>
                      <p>{{ item.summary }}</p>
                      <dl class="evidence-metrics" data-evidence-detail="coverage-state">
                        <div><dt>精确方案</dt><dd>{{ evidenceSchemeLabel(item) }}</dd></div>
                        <div><dt>覆盖类型</dt><dd>{{ coverageTypeLabel(item) }}</dd></div>
                        <div><dt>访问方式</dt><dd>{{ accessClassLabel(item.facts.accessClass) }}</dd></div>
                        <div><dt>运行资格</dt><dd>{{ runtimeEligibilityLabel(item.facts.runtimeEligibility, item.status) }}</dd></div>
                        <div><dt>本次调用</dt><dd>未执行</dd></div>
                        <div><dt>缺失含义</dt><dd>保持中性</dd></div>
                      </dl>
                      <p class="coverage-neutrality-note">{{ coverageNeutralityNote(item) }}</p>
                    </details>
                  </template>
                </section>

                <section class="report-section limitations">
                  <h3>当前限制</h3>
                  <ul><li v-for="item in report.limitations" :key="item">{{ item }}</li></ul>
                </section>
              </template>

                  <div v-if="analysis.error" class="error-banner inline-error" role="alert">
                    <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                    <span>{{ analysis.error.message }}</span>
                    <button v-if="analysis.error.retryable" class="retry-button" type="button" :disabled="analysisSubmitting" @click="retryAnalysis">
                      <i :class="analysisSubmitting ? 'fas fa-circle-notch fa-spin' : 'fas fa-rotate-right'" aria-hidden="true"></i>
                      {{ analysisSubmitting ? '重试中' : '重试' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <div v-if="analysisError" class="error-banner" role="alert">
              <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
              <span>{{ analysisError }}</span>
              <button type="button" title="关闭" @click="analysisError = ''"><i class="fas fa-xmark" aria-hidden="true"></i></button>
            </div>
            <div v-if="messages.length" ref="messageList" class="message-list followup-list" aria-live="polite">
            <article v-for="message in messages" :key="message.id" class="message" :class="message.role">
              <div class="message-meta">{{ message.role === 'user' ? '你' : 'Agent' }}</div>
              <div class="message-content">{{ chatMessageContent(message) }}</div>
            </article>
            </div>
            <div v-if="sending" class="message assistant pending-message inline-pending">
              <div class="message-meta">Agent</div>
              <div class="typing-indicator" aria-label="Agent 正在响应">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div v-if="analysis && report && !messages.length && !sending" class="followup-suggestions" aria-label="建议追问">
              <span>继续审查</span>
              <button type="button" :disabled="!providerReady" @click="useFollowupPrompt('请用更通俗的语言解释这份报告的结论。')">解释结论</button>
              <button type="button" :disabled="!providerReady" @click="useFollowupPrompt('请列出当前结论最主要的不确定性。')">查看不确定性</button>
              <button type="button" :disabled="!providerReady" @click="useFollowupPrompt('请按重要程度整理本次检测的证据。')">整理证据</button>
            </div>
          <div v-if="error" class="error-banner" role="alert">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            <span>{{ error }}</span>
            <button type="button" title="关闭" @click="error = ''">
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <div v-if="notice" class="notice-banner" role="status">
            <i class="fas fa-circle-check" aria-hidden="true"></i>
            <span>{{ notice }}</span>
            <button type="button" title="关闭" @click="notice = ''">
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <form class="composer unified-composer" @submit.prevent="sendUnified">
            <div v-if="selectedFile && !analysis" class="composer-attachment">
              <img v-if="previewUrl" :src="previewUrl" alt="待发送图像预览">
              <div>
                <strong>{{ selectedFile.name }}</strong>
                <span>{{ formatBytes(selectedFile.size) }}</span>
                <label class="check-row analysis-option">
                  <input v-model="enableLocalization" type="checkbox">
                  <span>满足条件时尝试局部定位</span>
                </label>
              </div>
              <button class="icon-button" type="button" title="移除图像" @click="clearSelectedImage">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
            <label v-if="!analysis" class="attach-button" title="添加图片">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="selectImage">
              <i class="fas fa-paperclip" aria-hidden="true"></i>
            </label>
            <textarea
              v-model="draft"
              rows="3"
              maxlength="8000"
              :disabled="sending || analysisSubmitting || loading"
              :placeholder="analysis ? '继续询问这份检测报告' : selectedFile ? '补充希望 Agent 重点分析的内容（可选）' : '点击左侧附件按钮上传图片'"
              @keydown.enter.exact.prevent="sendUnified"
            ></textarea>
            <div class="composer-actions">
              <span class="composer-hint">{{ analysis ? 'Enter 发送' : '上传图像后发送' }}</span>
              <button class="send-button" type="submit" :disabled="!canSendUnified" title="发送">
                <i :class="analysisSubmitting ? 'fas fa-circle-notch fa-spin' : 'fas fa-arrow-up'" aria-hidden="true"></i>
                <span class="send-label">{{ analysisSubmitting ? '分析中' : '发送' }}</span>
              </button>
            </div>
          </form>
          </section>
        </div>
      </div>
    </main>

    <div v-if="settingsOpen" class="dialog-backdrop" role="presentation" @mousedown.self="closeConfiguration">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="dialog-header">
          <div>
            <h2 id="settings-title">模型连接配置</h2>
            <p>配置 Pi 对话所使用的模型服务</p>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭配置" :disabled="configBusy" @click="closeConfiguration">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <form class="settings-form" @submit.prevent="saveConfiguration">
          <div v-if="configLoading" class="config-loading" aria-live="polite">
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            正在读取配置
          </div>

          <template v-else>
            <div v-if="!runtimeConfigEnabled" class="config-warning" role="alert">
              当前服务已禁用网页运行时配置，请由部署环境注入模型凭据。
            </div>

            <fieldset :disabled="configBusy || !runtimeConfigEnabled">
              <legend>连接信息</legend>
              <label class="form-field">
                <span>服务商</span>
                <select v-model="configForm.provider" @change="applyProviderPreset">
                  <option v-for="provider in providerPresets" :key="provider.value" :value="provider.value">
                    {{ provider.label }}
                  </option>
                </select>
              </label>

              <label class="form-field">
                <span>模型 ID</span>
                <input v-model.trim="configForm.model" type="text" maxlength="200" autocomplete="off" placeholder="例如 gpt-5.4" required>
                <small>填写模型服务实际暴露的模型标识</small>
              </label>
            </fieldset>

            <fieldset :disabled="configBusy || !runtimeConfigEnabled">
              <legend>访问凭据</legend>
              <label class="form-field">
                <span>API Key</span>
                <div class="secret-input">
                  <input
                    v-model="configForm.apiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    maxlength="8192"
                    autocomplete="new-password"
                    :placeholder="apiKeyConfigured ? '已配置，留空保持不变' : '输入 API Key'"
                    :disabled="configForm.allowAnonymous || configBusy || !runtimeConfigEnabled"
                  >
                  <button type="button" :title="showApiKey ? '隐藏密钥' : '显示密钥'" :aria-label="showApiKey ? '隐藏密钥' : '显示密钥'" @click="showApiKey = !showApiKey">
                    <i :class="showApiKey ? 'fas fa-eye-slash' : 'fas fa-eye'" aria-hidden="true"></i>
                  </button>
                </div>
                <small>密钥仅发送到 Agent 服务，本页面不会回读或持久化明文</small>
              </label>

              <label v-if="apiKeyConfigured" class="check-row">
                <input v-model="configForm.clearApiKey" type="checkbox">
                <span>清除服务进程中现有的 API Key</span>
              </label>
            </fieldset>

            <fieldset :disabled="configBusy || !runtimeConfigEnabled">
              <legend>高级设置</legend>
              <label class="form-field">
                <span>API Base URL</span>
                <input
                  v-model.trim="configForm.baseUrl"
                  type="url"
                  maxlength="2048"
                  autocomplete="url"
                  :required="configForm.provider === 'custom-openai'"
                  placeholder="留空使用服务商默认地址"
                >
                <small>本地或自建模型请填写 OpenAI 兼容的 API 根地址</small>
              </label>

              <label class="check-row">
                <input v-model="configForm.allowAnonymous" type="checkbox">
                <span>本地端点不需要 API Key</span>
              </label>
            </fieldset>

            <div v-if="configError" class="config-result failed" role="alert">
              <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
              {{ configError }}
            </div>
            <div v-if="configFeedback" class="config-result success" role="status">
              <i class="fas fa-circle-check" aria-hidden="true"></i>
              {{ configFeedback }}
            </div>
          </template>

          <footer class="dialog-footer">
            <button class="cancel-button" type="button" :disabled="configBusy" @click="closeConfiguration">取消</button>
            <button class="test-button" type="button" :disabled="configLoading || configBusy || !runtimeConfigEnabled" @click="testConfiguration">
              <i v-if="configTesting" class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              <i v-else class="fas fa-plug-circle-check" aria-hidden="true"></i>
              {{ configTesting ? '测试中' : '测试连接' }}
            </button>
            <button class="save-button" type="submit" :disabled="configLoading || configBusy || !runtimeConfigEnabled">
              <i v-if="configSaving" class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              <i v-else class="fas fa-check" aria-hidden="true"></i>
              {{ configSaving ? '应用中' : '保存并应用' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import {
  agentApi,
  type AnalysisReport,
  type AnalysisRun,
  type EvidenceRecord,
  type StageState,
  type AgentHealth,
  type AgentMessage,
  type AgentRuntimeConfigInput,
  type AgentSession,
} from '../api/agent'

const providerPresets = [
  { value: 'openai', label: 'OpenAI', model: 'gpt-5.4', baseUrl: '' },
  { value: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-6', baseUrl: '' },
  { value: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'openrouter', label: 'OpenRouter', model: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'google', label: 'Google Gemini', model: 'gemini-2.5-flash', baseUrl: '' },
  { value: 'custom-openai', label: '自定义 OpenAI 兼容', model: '', baseUrl: '' },
] as const

const ANALYSIS_STORAGE_KEY = 'detection-agent-analysis-id'
const ANALYSIS_PROMPT_STORAGE_KEY = 'detection-agent-analysis-prompt'
const SESSION_STORAGE_KEY = 'detection-agent-session-id'

const health = ref<AgentHealth | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const pendingSubmissionKey = ref('')
const submittedPrompt = ref('请判断这张图片是否由 AI 生成，并给出完整分析报告。')
const enableLocalization = ref(false)
const analysis = ref<AnalysisRun | null>(null)
const report = ref<AnalysisReport | null>(null)
const analysisSubmitting = ref(false)
const analysisCancelling = ref(false)
const analysisError = ref('')
const analysisProgressCursor = ref(0)
let analysisRequestGeneration = 0
let analysisPollTimer: number | undefined
const session = ref<AgentSession | null>(null)
const draft = ref('')
const error = ref('')
const notice = ref('')
const loading = ref(true)
const sending = ref(false)
const messageList = ref<HTMLElement | null>(null)
const settingsOpen = ref(false)
const configLoading = ref(false)
const configTesting = ref(false)
const configSaving = ref(false)
const configError = ref('')
const configFeedback = ref('')
const showApiKey = ref(false)
const apiKeyConfigured = ref(false)
const runtimeConfigEnabled = ref(true)
const configForm = reactive({
  provider: 'openai',
  model: 'gpt-5.4',
  apiKey: '',
  baseUrl: '',
  allowAnonymous: false,
  clearApiKey: false,
})

const messages = computed<AgentMessage[]>(() => session.value?.messages || [])
const providerReady = computed(() => health.value?.pi.providerReady === true)
const canSendUnified = computed(() => {
  if (sending.value || analysisSubmitting.value || loading.value) return false
  if (selectedFile.value) return true
  if (!analysis.value) return false
  return providerReady.value && Boolean(session.value) && draft.value.trim().length > 0
})
const connectionLabel = computed(() => {
  if (loading.value) return '连接中'
  if (!health.value) return '服务离线'
  return providerReady.value ? 'Pi 已连接' : '模型待配置'
})
const connectionClass = computed(() => providerReady.value ? 'online' : health.value ? 'warning' : 'offline')
const configBusy = computed(() => configTesting.value || configSaving.value)
const analysisStateLabel = computed(() => ({
  queued: '等待执行', running: '分析中', completed: '分析完成', failed: '分析失败', cancelled: '已取消',
}[analysis.value?.state || 'queued']))
const executedEvidence = computed(() => report.value?.evidence.filter((item) => !isUnattemptedCoverage(item)) || [])
const coverageEvidence = computed(() => report.value?.evidence.filter(isUnattemptedCoverage) || [])
const displayProductDecision = computed(() => {
  if (!report.value) return null
  if (report.value.productDecision) return report.value.productDecision
  const assessment = report.value.aiAssessment?.reconciled
  if (assessment && assessment.confidenceBand !== 'unavailable') {
    return { ...report.value.decision, verdict: assessment.verdict, confidenceBand: assessment.confidenceBand }
  }
  return report.value.decision
})

function formatBytes(size: number) {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

function stageStateLabel(state: StageState) {
  return ({ pending: '等待', running: '执行中', completed: '完成', skipped: '跳过', policy_disabled: '策略未启用', unavailable: '不可用', failed: '失败' })[state]
}

function stageIcon(state: StageState) {
  return {
    pending: 'far fa-clock', running: 'fas fa-circle-notch fa-spin', completed: 'fas fa-circle-check',
    skipped: 'fas fa-forward', policy_disabled: 'fas fa-toggle-off', unavailable: 'fas fa-circle-minus', failed: 'fas fa-circle-xmark',
  }[state]
}

function verdictLabel(verdict: AnalysisReport['decision']['verdict']) {
  return ({ AI_GENERATED: '检测为 AI 生成', LIKELY_NON_AI: '倾向非 AI 生成', INCONCLUSIVE: '证据不足' })[verdict]
}

function provenanceVerdictLabel(verdict: AnalysisReport['decision']['verdict']) {
  return ({ AI_GENERATED: '已验证 AI 来源', LIKELY_NON_AI: '倾向非 AI 来源', INCONCLUSIVE: '未建立可信来源结论' })[verdict]
}

function confidenceBandLabel(band: AnalysisReport['decision']['confidenceBand']) {
  return ({ high: '高', medium: '中', low: '低', unavailable: '不可用' })[band]
}

function validationStatusLabel(status: AnalysisReport['validation']['status']) {
  return ({ verified: '解释已复核', fallback: '已使用安全回退', failed: '解释复核失败', not_run: '解释尚未复核' })[status]
}

function validationCheckLabel(method: AnalysisReport['validation']['checks'][number]['method']) {
  return ({
    exact: '确定性校验',
    semantic_positive: '正向问题',
    semantic_inverse: '反向问题',
    semantic_paraphrase: '改写问题',
    semantic_forced_choice: '强制选择',
  })[method]
}

function visualValidationOutcomeLabel(outcome: 'supported' | 'contradicted' | 'unverifiable') {
  return ({ supported: '支持', contradicted: '不支持', unverifiable: '无法核验' })[outcome]
}

function visualConsistencyLabel(outcome: 'consistent' | 'conflict' | 'unverifiable' | 'not_checked') {
  return ({ consistent: '一致', conflict: '冲突', unverifiable: '无法核验', not_checked: '未复查' })[outcome]
}

function visualQuestionLabel(variant: 'positive' | 'semantic_inverse' | 'paraphrase' | 'forced_choice') {
  return ({ positive: '正向问题', semantic_inverse: '反向问题', paraphrase: '改写问题', forced_choice: '强制选择' })[variant]
}

function visibleMarkStatusLabel(status: 'supported' | 'absent' | 'unverifiable' | 'failed') {
  return ({ supported: '标识存在', absent: '未发现', unverifiable: '无法复核', failed: '检查失败' })[status]
}

function visibleMarkTypeLabel(markType: 'text_label' | 'provider_logo' | 'disclosure_badge' | 'other_ai_claim' | 'none' | 'unknown') {
  return ({ text_label: 'AI 文字标签', provider_logo: '厂商徽标', disclosure_badge: '披露徽章', other_ai_claim: '其他 AI 声明', none: '未发现标识', unknown: '标识状态未知' })[markType]
}

function promptBundleStatusLabel(status?: 'prototype_not_calibrated') {
  return status === 'prototype_not_calibrated' ? '原型，尚未完成校准' : '未记录'
}

function localizationStyle(region: readonly [number, number, number, number]) {
  return {
    left: `${region[0] * 100}%`,
    top: `${region[1] * 100}%`,
    width: `${(region[2] - region[0]) * 100}%`,
    height: `${(region[3] - region[1]) * 100}%`,
  }
}

function formatRegion(region: readonly [number, number, number, number]) {
  return region.map((value) => `${Math.round(value * 100)}%`).join(' / ')
}

function evidenceCategoryLabel(category: string) {
  return ({ integrity: '文件完整性', provenance: '来源凭证', watermark: '水印', metadata: '元数据', visual: '多模态视觉调查', model: '检测模型', localization: '局部定位' } as Record<string, string>)[category] || category
}

function isUnattemptedCoverage(item: EvidenceRecord) {
  return ['watermark', 'model'].includes(item.category) && item.facts.detectionAttempted === false
}

function evidenceStatusLabel(item: EvidenceRecord) {
  if (isUnattemptedCoverage(item)) return item.status === 'policy_disabled' ? '策略未调用' : '未执行'
  if (item.source === 'c2pa' && item.facts.c2paOutcome === 'invalid') return '凭证无效'
  return ({ verified_present: '已验证', possibly_present: '疑似存在', detected: '已发现', not_detected: '已执行 · 未发现', policy_disabled: '策略未启用', detector_unavailable: '检测器不可用', unsupported_format: '格式不支持', unavailable: '不可用', unsupported: '不支持', invalid: '凭证无效', error: '调用错误' } as Record<string, string>)[item.status] || item.status
}

function evidenceSchemeLabel(item: EvidenceRecord) {
  return typeof item.facts.schemeId === 'string' && item.facts.schemeId.trim()
    ? item.facts.schemeId
    : item.source
}

function c2paTrustLabel(item: EvidenceRecord) {
  if (item.facts.provenanceVerified === true || item.facts.c2paOutcome === 'valid_trusted') return '已验证且受信任'
  if (item.facts.c2paOutcome === 'valid_untrusted') return '结构有效但不受信任'
  if (item.facts.c2paOutcome === 'invalid') return '凭证无效'
  if (item.status === 'not_detected') return '未发现凭证'
  if (['unsupported_format', 'unsupported'].includes(item.status)) return '格式不支持'
  if (['detector_unavailable', 'unavailable'].includes(item.status)) return '验证器不可用'
  if (item.status === 'error') return '验证失败'
  return '未建立信任'
}

function c2paOriginLabel(value: string | number | boolean | null) {
  return value === true ? '声明 AI 生成' : value === false ? '声明非 AI 来源' : '未明确声明'
}

function metadataAuthenticationLabel(item: EvidenceRecord) {
  if (item.facts.authenticated === true && item.status === 'verified_present') return '已认证'
  if (item.facts.conflict === true) return '字段冲突，未认证'
  if (item.status === 'detected') return '未认证，仅辅助'
  if (item.status === 'not_detected') return '未发现 AIGC 元数据'
  if (['unsupported_format', 'unsupported'].includes(item.status)) return '未执行，格式不支持'
  if (['detector_unavailable', 'unavailable'].includes(item.status)) return '认证能力不可用'
  if (item.status === 'error') return '结构或解析校验失败'
  return '未认证'
}

function metadataNeedsAuthenticationWarning(item: EvidenceRecord) {
  return item.facts.authenticated !== true && ['detected', 'error', 'possibly_present'].includes(item.status)
}

function coverageTypeLabel(item: EvidenceRecord) {
  return item.category === 'model' ? '检测模型' : '水印/来源方案'
}

function accessClassLabel(value: string | number | boolean | null) {
  if (typeof value !== 'string') return '内部策略'
  return ({
    local_open_source: '本地开源',
    local_standard_parser: '本地标准解析',
    research_only: '仅研究',
    manual_public_verifier: '官方公开网页验证',
    manual_limited_verifier: '受限人工验证',
    authenticated_commercial_api: '商业认证 API',
    vendor_assisted: '厂商协助验证',
  } as Record<string, string>)[value] || value
}

function runtimeEligibilityLabel(value: string | number | boolean | null, status: EvidenceRecord['status']) {
  if (typeof value === 'string') {
    return ({
      planned_local: '可规划本地运行',
      evaluation_only: '仅离线评估',
      unavailable: '无授权本地检测器',
      disabled_policy: '当前策略禁用',
    } as Record<string, string>)[value] || value
  }
  return status === 'policy_disabled' ? '当前策略禁用' : '本次不可执行'
}

function coverageNeutralityNote(item: EvidenceRecord) {
  return item.category === 'model'
    ? '模型策略未调用不代表图像为非 AI，也不属于模型检测失败。'
    : '该方案本次没有执行，因此不能解释为已确认水印不存在。'
}

function formatLatency(value: string | number | boolean | null) {
  return typeof value === 'number' ? `${value.toFixed(0)} ms` : '--'
}

function formatScore(value: string | number | boolean | null) {
  return typeof value === 'number' ? value.toFixed(4) : '--'
}

function formatDigest(value: string | number | boolean | null) {
  return typeof value === 'string' && value.length >= 12 ? `${value.slice(0, 12)}...` : '--'
}

function modelDirectionLabel(value: string | number | boolean | null) {
  return value === 'ai_generated' ? '支持 AI 生成' : value === 'non_ai' ? '支持非 AI' : '未知'
}

function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  analysisError.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    analysisError.value = '仅支持 PNG、JPEG、WebP 或 GIF 图像'
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    analysisError.value = '图像不能超过 10 MB'
    input.value = ''
    return
  }
  clearSelectedImage()
  pendingSubmissionKey.value = ''
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function clearSelectedImage() {
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  selectedFile.value = null
}

function createSubmissionKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return `analysis-${Date.now()}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取图像'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.readAsDataURL(file)
  })
}

async function submitAnalysis() {
  if (!selectedFile.value || analysisSubmitting.value) return
  analysisSubmitting.value = true
  analysisError.value = ''
  try {
    const file = selectedFile.value
    pendingSubmissionKey.value ||= createSubmissionKey()
    submittedPrompt.value = draft.value.trim() || '请判断这张图片是否由 AI 生成，并给出完整分析报告。'
    draft.value = ''
    analysis.value = await agentApi.createAnalysis({
      filename: file.name,
      mimeType: file.type,
      dataBase64: await fileAsBase64(file),
      idempotencyKey: pendingSubmissionKey.value,
      options: { enableLocalization: enableLocalization.value },
    })
    pendingSubmissionKey.value = ''
    analysisProgressCursor.value = 0
    if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = analysis.value.assetDeletedAt ? '' : agentApi.analysisAssetUrl(analysis.value.id)
    sessionStorage.setItem(ANALYSIS_STORAGE_KEY, analysis.value.id)
    sessionStorage.setItem(ANALYSIS_PROMPT_STORAGE_KEY, submittedPrompt.value)
    await refreshAnalysis()
  } catch (cause) {
    analysisError.value = cause instanceof Error ? cause.message : '无法提交分析'
  } finally {
    analysisSubmitting.value = false
  }
}

async function refreshAnalysis() {
  if (!analysis.value) return
  const generation = analysisRequestGeneration
  const analysisId = analysis.value.id
  window.clearTimeout(analysisPollTimer)
  try {
    const nextAnalysis = await agentApi.getAnalysis(analysisId)
    if (generation !== analysisRequestGeneration || analysis.value?.id !== analysisId) return
    analysis.value = nextAnalysis
    try {
      const progress = await agentApi.getAnalysisProgress(analysisId, analysisProgressCursor.value)
      if (generation === analysisRequestGeneration && analysis.value?.id === analysisId) {
        analysisProgressCursor.value = Math.max(analysisProgressCursor.value, progress.nextCursor)
      }
    } catch {
      // Older gateways may not expose the cursor endpoint; full status polling remains valid.
    }
    if (analysis.value.state === 'completed') {
      report.value = await agentApi.getReport(analysis.value.id)
      return
    }
    if (analysis.value.state === 'queued' || analysis.value.state === 'running') {
      analysisPollTimer = window.setTimeout(refreshAnalysis, 600)
    }
  } catch (cause) {
    analysisError.value = cause instanceof Error ? cause.message : '无法读取分析状态'
  }
}

function resetAnalysis(options: { preserveSelectedImage?: boolean } = {}) {
  analysisRequestGeneration += 1
  window.clearTimeout(analysisPollTimer)
  sessionStorage.removeItem(ANALYSIS_STORAGE_KEY)
  sessionStorage.removeItem(ANALYSIS_PROMPT_STORAGE_KEY)
  analysis.value = null
  report.value = null
  pendingSubmissionKey.value = ''
  analysisError.value = ''
  analysisProgressCursor.value = 0
  if (!options.preserveSelectedImage) {
    enableLocalization.value = false
    clearSelectedImage()
  }
}

async function resetWorkspace() {
  resetAnalysis()
  await resetSession()
  submittedPrompt.value = '请判断这张图片是否由 AI 生成，并给出完整分析报告。'
}

async function retryAnalysis() {
  if (!analysis.value?.error?.retryable || analysisSubmitting.value) return
  analysisSubmitting.value = true
  analysisError.value = ''
  try {
    analysis.value = await agentApi.retryAnalysis(analysis.value.id)
    analysisProgressCursor.value = 0
    report.value = null
    await refreshAnalysis()
  } catch (cause) {
    analysisError.value = cause instanceof Error ? cause.message : '无法重试分析'
    await refreshAnalysis()
  } finally {
    analysisSubmitting.value = false
  }
}

async function cancelCurrentAnalysis() {
  if (!analysis.value || !['queued', 'running'].includes(analysis.value.state) || analysisCancelling.value) return
  analysisCancelling.value = true
  analysisError.value = ''
  try {
    analysis.value = await agentApi.cancelAnalysis(analysis.value.id)
    window.clearTimeout(analysisPollTimer)
  } catch (cause) {
    analysisError.value = cause instanceof Error ? cause.message : '无法取消分析'
  } finally {
    analysisCancelling.value = false
  }
}

async function sendUnified() {
  if (selectedFile.value) {
    if (analysis.value) {
      resetAnalysis({ preserveSelectedImage: true })
      await resetSession()
    }
    await submitAnalysis()
    return
  }
  if (!analysis.value) return
  await sendMessage()
}

function useFollowupPrompt(prompt: string) {
  if (!providerReady.value || sending.value) return
  draft.value = prompt
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.unified-composer textarea')?.focus())
}

function applyProviderPreset() {
  const preset = providerPresets.find((item) => item.value === configForm.provider)
  if (!preset) return
  configForm.model = preset.model
  configForm.baseUrl = preset.baseUrl
  configForm.allowAnonymous = preset.value === 'custom-openai'
  configForm.clearApiKey = false
  configError.value = ''
  configFeedback.value = ''
}

function configurationPayload(): AgentRuntimeConfigInput {
  const payload: AgentRuntimeConfigInput = {
    provider: configForm.provider,
    model: configForm.model.trim(),
    baseUrl: configForm.baseUrl.trim() || undefined,
    allowAnonymous: configForm.allowAnonymous,
    clearApiKey: configForm.clearApiKey,
  }
  if (configForm.apiKey.trim()) payload.apiKey = configForm.apiKey.trim()
  return payload
}

function validateConfiguration(): string {
  if (!configForm.model.trim()) return '请填写模型 ID'
  if (configForm.provider === 'custom-openai' && !configForm.baseUrl.trim()) return '自定义服务需要 API Base URL'
  if (!configForm.allowAnonymous && !configForm.apiKey.trim() && (!apiKeyConfigured.value || configForm.clearApiKey)) {
    return '请填写 API Key，或启用本地匿名端点'
  }
  return ''
}

async function openConfiguration() {
  settingsOpen.value = true
  configLoading.value = true
  configError.value = ''
  configFeedback.value = ''
  showApiKey.value = false
  try {
    const configuration = await agentApi.getConfiguration()
    const knownProvider = providerPresets.some((item) => item.value === configuration.provider)
    configForm.provider = knownProvider ? configuration.provider : 'custom-openai'
    configForm.model = configuration.model
    configForm.baseUrl = configuration.baseUrl || ''
    configForm.apiKey = ''
    configForm.allowAnonymous = configuration.allowAnonymous
    configForm.clearApiKey = false
    apiKeyConfigured.value = configuration.apiKeyConfigured
    runtimeConfigEnabled.value = configuration.runtimeConfigEnabled
  } catch (cause) {
    configError.value = cause instanceof Error ? cause.message : '无法读取模型配置'
  } finally {
    configLoading.value = false
  }
}

function closeConfiguration() {
  if (configBusy.value) return
  settingsOpen.value = false
}

async function testConfiguration() {
  const validationError = validateConfiguration()
  if (validationError) {
    configError.value = validationError
    return
  }
  configTesting.value = true
  configError.value = ''
  configFeedback.value = ''
  try {
    const result = await agentApi.testConfiguration(configurationPayload())
    configFeedback.value = `连接成功，服务响应 ${result.latencyMs} ms`
  } catch (cause) {
    configError.value = cause instanceof Error ? cause.message : '连接测试失败'
  } finally {
    configTesting.value = false
  }
}

async function saveConfiguration() {
  const validationError = validateConfiguration()
  if (validationError) {
    configError.value = validationError
    return
  }
  configSaving.value = true
  configError.value = ''
  configFeedback.value = ''
  try {
    await agentApi.updateConfiguration(configurationPayload())
    settingsOpen.value = false
    notice.value = '模型连接已应用，旧会话已重置'
    await initialize()
  } catch (cause) {
    configError.value = cause instanceof Error ? cause.message : '无法应用模型配置'
  } finally {
    configSaving.value = false
  }
}

async function initialize() {
  loading.value = true
  error.value = ''
  session.value = null
  try {
    health.value = await agentApi.health()
    const storedSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (storedSessionId) {
      try {
        session.value = await agentApi.getSession(storedSessionId)
      } catch {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
      }
    }
    if (!session.value) {
      session.value = await agentApi.createSession()
      sessionStorage.setItem(SESSION_STORAGE_KEY, session.value.id)
    }
    const analysisId = sessionStorage.getItem(ANALYSIS_STORAGE_KEY)
    if (analysisId) {
      try {
        analysis.value = await agentApi.getAnalysis(analysisId)
        submittedPrompt.value = sessionStorage.getItem(ANALYSIS_PROMPT_STORAGE_KEY)
          || '请判断这张图片是否由 AI 生成，并给出完整分析报告。'
        previewUrl.value = analysis.value.assetDeletedAt ? '' : agentApi.analysisAssetUrl(analysis.value.id)
        await refreshAnalysis()
      } catch {
        sessionStorage.removeItem(ANALYSIS_STORAGE_KEY)
        sessionStorage.removeItem(ANALYSIS_PROMPT_STORAGE_KEY)
      }
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Agent服务连接失败'
  } finally {
    loading.value = false
  }
}

async function resetSession() {
  loading.value = true
  error.value = ''
  try {
    session.value = await agentApi.createSession()
    sessionStorage.setItem(SESSION_STORAGE_KEY, session.value.id)
    draft.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法创建会话'
  } finally {
    loading.value = false
  }
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!canSendUnified.value || !session.value || !content || !analysis.value) return
  sending.value = true
  error.value = ''
  draft.value = ''
  try {
    session.value = await agentApi.sendMessage(
      session.value.id,
      `[当前分析ID: ${analysis.value.id}] ${content}`,
    )
    await nextTick()
    messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' })
  } catch (cause) {
    draft.value = content
    error.value = cause instanceof Error ? cause.message : '消息发送失败'
  } finally {
    sending.value = false
  }
}

function chatMessageContent(message: AgentMessage) {
  return message.role === 'user'
    ? message.content.replace(/^\[当前分析ID: [^\]]+\]\s*/, '')
    : message.content
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeConfiguration()
}

onMounted(() => {
  initialize()
  window.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
  window.clearTimeout(analysisPollTimer)
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
})
</script>

<style scoped>
.agent-page {
  display: flex;
  min-height: calc(100vh - 78px);
  background: #f4f6f8;
}

.layout-sidebar {
  flex: 0 0 240px;
  background: rgb(227, 236, 250);
}

.agent-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}

.agent-header {
  max-width: 1280px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.agent-header h1 {
  margin: 0;
  color: #182230;
  font-size: 26px;
  letter-spacing: 0;
}

.agent-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 14px;
}

.agent-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-button {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 0;
  border: 1px solid #c9d0d8;
  border-radius: 6px;
  color: #344054;
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover:not(:disabled) {
  border-color: #7b9dbc;
  color: #1e5f99;
  background: #f6f9fc;
}

.connection-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475467;
  font-size: 14px;
  white-space: nowrap;
}

.state-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #98a2b3;
}

.connection-state.online .state-dot { background: #16803c; }
.connection-state.warning .state-dot { background: #d97706; }
.connection-state.offline .state-dot { background: #c62f2f; }

.agent-workspace {
  max-width: 1280px;
  min-height: 620px;
  height: calc(100vh - 175px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #d7dce2;
  border-radius: 8px;
  background: #ffffff;
}

.status-panel {
  padding: 20px;
  border-right: 1px solid #e4e7ec;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.status-section h2 {
  margin: 0 0 12px;
  color: #344054;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
}

.status-section dl {
  margin: 0;
}

.status-section dl div,
.capability-row {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.status-section dt { color: #667085; font-weight: 400; }
.status-section dd { margin: 0; color: #1d2939; text-align: right; overflow-wrap: anywhere; }

.status-tag {
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.status-tag.ready { color: #116329; background: #e9f7ee; }
.status-tag.pending { color: #92400e; background: #fff4df; }

.secondary-button,
.send-button {
  min-height: 40px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
}

.secondary-button {
  margin-top: auto;
  border: 1px solid #b8c1cc;
  color: #344054;
  background: #ffffff;
}

.right-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.workspace-tabs {
  padding: 0 20px;
  display: flex;
  align-items: end;
  gap: 22px;
  border-bottom: 1px solid #e4e7ec;
}

.workspace-tabs button {
  height: 52px;
  padding: 0 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  color: #667085;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.workspace-tabs button.active { border-bottom-color: #1e5f99; color: #1e5f99; }

.analysis-panel {
  min-height: 0;
  overflow-y: auto;
  padding: 24px clamp(18px, 4vw, 56px);
}

.unified-conversation {
  position: relative;
  padding-bottom: 0;
}

.conversation-empty {
  min-height: calc(100% - 120px);
  padding: 40px 20px;
}

.conversation-empty p {
  width: 100%;
  max-width: 440px;
  padding: 0 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.image-message {
  max-width: min(82%, 720px);
  margin: 0 0 22px auto;
}

.analysis-message {
  width: 100%;
  max-width: 100%;
}

.analysis-message-content {
  padding: 18px;
  border-color: #d7dce2;
  background: #ffffff;
  white-space: normal;
}

.image-message .message-content {
  padding: 8px;
  display: grid;
  gap: 8px;
}

.asset-deleted-note {
  padding: 12px;
  border: 1px dashed #98a2b3;
  border-radius: 5px;
  color: #475467;
  background: #f8fafc;
  font-size: 13px;
}

.image-message img {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 4px;
  background: #101828;
}

.ai-assessment-report {
  margin: 0 0 22px;
  padding: 18px;
  border: 1px solid #d0d5dd;
  border-left: 4px solid #b54708;
  border-radius: 6px;
  background: #fff;
}

.ai-assessment-report.ai_generated { border-left-color: #b42318; }
.ai-assessment-report.likely_non_ai { border-left-color: #16803c; }

.ai-assessment-report > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ai-assessment-report header span,
.ai-assessment-report small { color: #667085; font-size: 11px; }
.ai-assessment-report header h2 { margin: 3px 0 0; color: #182230; font-size: 22px; letter-spacing: 0; }
.ai-assessment-report header > strong { color: #344054; font-size: 18px; }
.assessment-authority { margin-top: 5px; display: block; }
.ai-assessment-report > p { color: #344054; font-size: 14px; line-height: 1.7; }
.ai-assessment-report details { margin-top: 14px; border-top: 1px solid #eaecf0; padding-top: 10px; }
.ai-assessment-report summary { color: #475467; font-size: 12px; cursor: pointer; }
.assessment-limitations { margin-top: 12px; padding-top: 10px; border-top: 1px solid #eaecf0; }
.assessment-limitations strong { color: #344054; font-size: 12px; }
.assessment-limitations ul { margin: 5px 0 0; padding-left: 18px; }
.assessment-limitations li { color: #667085; font-size: 11px; line-height: 1.55; }

.assessment-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.assessment-columns h3 { margin: 0 0 6px; color: #344054; font-size: 12px; }
.assessment-columns ul { margin: 0; padding-left: 18px; }
.assessment-columns li,
.assessment-columns p { margin: 4px 0; color: #475467; font-size: 12px; line-height: 1.55; }

.followup-list {
  padding: 12px 0 0;
  overflow: visible;
  border-top: 1px solid #eaecf0;
}

.inline-pending { margin-top: 14px; }

.composer.unified-composer {
  position: sticky;
  bottom: 0;
  z-index: 4;
  margin: 20px calc(-1 * clamp(18px, 4vw, 56px)) 0;
  padding-left: clamp(18px, 4vw, 56px);
  padding-right: clamp(18px, 4vw, 56px);
  grid-template-columns: auto minmax(0, 1fr) auto;
  background: #fff;
}

.attach-button {
  width: 44px;
  height: 44px;
  margin-bottom: 16px;
  border: 1px solid #b8c1cc;
  border-radius: 6px;
  color: #344054;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.attach-button input { position: absolute; width: 1px; height: 1px; opacity: 0; }

.upload-workspace {
  width: min(100%, 680px);
  min-height: 280px;
  margin: 20px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.composer-attachment {
  width: 100%;
  grid-column: 1 / -1;
  padding: 10px;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
}

.composer-attachment img { width: 112px; height: 84px; border-radius: 4px; object-fit: contain; background: #101828; }
.composer-attachment > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.composer-attachment strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #344054; font-size: 13px; }
.composer-attachment span { color: #667085; font-size: 11px; }

.upload-zone {
  min-height: 300px;
  border: 1px dashed #98a2b3;
  border-radius: 8px;
  color: #475467;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
  cursor: pointer;
}

.upload-zone:hover { border-color: #2970b8; background: #f3f8fc; }
.upload-zone input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.upload-zone i { color: #2970b8; font-size: 34px; }
.upload-zone strong { color: #344054; font-size: 17px; }
.upload-zone span { color: #667085; font-size: 13px; }
.upload-zone.populated { background: #101828; }
.upload-zone img { width: 100%; height: 340px; object-fit: contain; }

.selected-file {
  min-height: 60px;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.selected-file div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.selected-file strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #344054; font-size: 14px; }
.selected-file span { color: #667085; font-size: 12px; }
.analysis-option { margin: 14px 0; }

.primary-action {
  width: 100%;
  min-height: 44px;
  border: 1px solid #1e5f99;
  border-radius: 6px;
  color: #fff;
  background: #1e5f99;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
}

.analysis-result { width: min(100%, 820px); margin: 0 auto; }
.analysis-result-header { margin-bottom: 22px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.analysis-result-header h2 { margin: 7px 0 3px; color: #182230; font-size: 20px; letter-spacing: 0; overflow-wrap: anywhere; }
.analysis-result-header p { margin: 0; color: #667085; font-size: 12px; overflow-wrap: anywhere; }
.analysis-state { padding: 3px 7px; border-radius: 4px; color: #475467; background: #f2f4f7; font-size: 12px; }
.analysis-state.running, .analysis-state.queued { color: #855d0b; background: #fff4df; }
.analysis-state.completed { color: #116329; background: #e9f7ee; }
.analysis-state.failed { color: #9b1c1c; background: #fff1f0; }

.stage-list { margin-bottom: 22px; border-top: 1px solid #eaecf0; }
.stage-row { min-height: 52px; padding: 9px 4px; border-bottom: 1px solid #eaecf0; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; color: #475467; }
.stage-row > i { color: #667085; text-align: center; }
.stage-row div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.stage-row strong { color: #344054; font-size: 13px; }
.stage-row div span { color: #667085; font-size: 12px; overflow-wrap: anywhere; }
.stage-row > span { font-size: 12px; }

.decision-block { margin: 0 0 22px; padding: 18px; border-left: 4px solid #b54708; background: #fff8e8; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.decision-block > div > span { color: #667085; font-size: 12px; }
.decision-block > div > small { margin-top: 5px; display: block; color: #667085; font-size: 11px; }
.decision-block h2 { margin: 4px 0 0; color: #7a4d08; font-size: 22px; letter-spacing: 0; }
.decision-block.ai_generated { border-color: #b42318; background: #fff1f0; }
.decision-block.ai_generated h2 { color: #9b1c1c; }
.decision-block.likely_non_ai { border-color: #16803c; background: #eff9f2; }
.decision-block.likely_non_ai h2 { color: #116329; }
.validation-badge { color: #116329; font-size: 12px; white-space: nowrap; }
.validation-badge.fallback, .validation-badge.failed, .validation-badge.not_run { color: #92400e; }

.report-section { margin: 0 0 22px; }
.report-section h3 { margin: 0 0 10px; color: #344054; font-size: 14px; letter-spacing: 0; }
.evidence-group-title { margin: 14px 0 4px; color: #475467; font-size: 12px; font-weight: 600; letter-spacing: 0; }
.evidence-group-title:first-of-type { margin-top: 0; }
.coverage-title { margin-top: 20px; padding-top: 14px; border-top: 1px solid #eaecf0; }
.report-section p, .report-section li { color: #475467; font-size: 13px; line-height: 1.65; }
.report-section .synthesis-meta { margin-top: 6px; color: #667085; font-size: 11px; }
.report-section ul { margin: 8px 0 0; padding-left: 20px; }
.conflicts-section { padding: 12px 14px; border-left: 3px solid #b42318; background: #fff6f5; }
.validation-summary { min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eaecf0; }
.validation-summary span { color: #344054; font-size: 13px; font-weight: 600; }
.validation-summary small { color: #667085; font-size: 11px; overflow-wrap: anywhere; text-align: right; }
.validation-details summary { min-height: 42px; display: flex; align-items: center; color: #475467; font-size: 12px; cursor: pointer; }
.validation-check { padding: 9px 0; border-top: 1px solid #f2f4f7; display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; color: #116329; }
.validation-check.contradicted { color: #9b1c1c; }
.validation-check.unverifiable, .validation-check.not_applicable { color: #92400e; }
.validation-check div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.validation-check strong { color: #344054; font-size: 12px; }
.validation-check span { overflow-wrap: anywhere; color: #667085; font-size: 11px; line-height: 1.45; }
.validation-check small { color: inherit; font-size: 10px; }
.visual-validation-note { margin: 0 0 8px; color: #667085 !important; font-size: 12px !important; }
.validation-details summary { gap: 12px; justify-content: space-between; }
.validation-details summary > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.visual-validation-status { flex: 0 0 auto; font-size: 11px; font-weight: 600; }
.visual-validation-status.supported { color: #116329; }
.visual-validation-status.contradicted { color: #9b1c1c; }
.visual-validation-status.unverifiable { color: #92400e; }
.visual-validation-status.absent { color: #667085; }
.visual-validation-status.failed { color: #9b1c1c; }
.visual-consistency-row { padding: 8px 0; display: flex; flex-wrap: wrap; gap: 8px 18px; color: #667085; font-size: 11px; }
.visible-mark-details { border-bottom: 1px solid #eaecf0; }
.visible-mark-details summary { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #344054; font-size: 12px; cursor: pointer; }
.visible-mark-details > p { margin: 8px 0; }
.visible-mark-warning { padding: 9px 10px; color: #7a4d08 !important; background: #fff8e8; display: flex; align-items: flex-start; gap: 8px; }
.localization-preview { position: relative; width: fit-content; max-width: 100%; margin: 10px 0; overflow: hidden; border: 1px solid #d0d5dd; background: #101828; }
.localization-preview img { display: block; width: auto; max-width: 100%; max-height: 420px; object-fit: contain; }
.localization-box { position: absolute; border: 2px solid #e5484d; background: rgb(229 72 77 / 12%); box-shadow: 0 0 0 1px rgb(255 255 255 / 70%); pointer-events: none; }
.localization-details { border-bottom: 1px solid #eaecf0; }
.localization-details summary { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #344054; font-size: 12px; cursor: pointer; }
.localization-details summary span:first-child { min-width: 0; overflow-wrap: anywhere; }
.localization-details summary span:last-child { flex: 0 0 auto; color: #9b1c1c; font-size: 11px; font-weight: 600; }
.localization-metrics { margin: 0 0 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.localization-metrics div { min-width: 0; }
.localization-metrics dt { color: #667085; font-size: 10px; }
.localization-metrics dd { margin: 3px 0 0; color: #344054; font-size: 11px; overflow-wrap: anywhere; }
.evidence-item { border-bottom: 1px solid #eaecf0; }
.evidence-item summary { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #344054; font-size: 13px; cursor: pointer; }
.evidence-item p { margin: 0 0 4px; }
.evidence-item small { margin-bottom: 12px; display: block; color: #667085; }
.evidence-metrics { margin: 0 0 10px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.evidence-metrics div { min-width: 0; }
.evidence-metrics dt { color: #667085; font-size: 11px; }
.evidence-metrics dd { margin: 2px 0 0; overflow-wrap: anywhere; color: #344054; font-size: 12px; }
.validation-issues { margin: 0 0 10px; overflow-wrap: anywhere; color: #9b1c1c !important; font-size: 11px !important; }
.coverage-item { opacity: 0.82; }
.evidence-status { padding: 2px 6px; border-radius: 4px; color: #475467; background: #f2f4f7; font-size: 11px; }
.evidence-status.detected { color: #116329; background: #e9f7ee; }
.evidence-status.policy_disabled, .evidence-status.detector_unavailable, .evidence-status.unsupported_format,
.evidence-status.unavailable, .evidence-status.unsupported { color: #92400e; background: #fff4df; }
.evidence-status.error { color: #9b1c1c; background: #fff1f0; }
.evidence-status.invalid { color: #9b1c1c; background: #fff1f0; }
.limitations { padding: 14px 16px; border: 1px solid #e4e7ec; border-radius: 6px; background: #f8fafc; }
.report-chat-button { width: 100%; margin-top: 4px; }

.conversation-panel {
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
}

.message-list {
  overflow-y: auto;
  padding: 28px clamp(20px, 5vw, 72px);
}

.empty-state {
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #667085;
  text-align: center;
}

.empty-state i { color: #2970b8; font-size: 34px; margin-bottom: 14px; }
.empty-state h2 { margin: 0 0 6px; color: #344054; font-size: 18px; letter-spacing: 0; }
.empty-state p { margin: 0; font-size: 14px; }

.message {
  max-width: min(78%, 760px);
  margin-bottom: 20px;
}

.message.user { margin-left: auto; }
.message.assistant { margin-right: auto; }
.message-meta { margin-bottom: 5px; color: #667085; font-size: 12px; }
.message.user .message-meta { text-align: right; }

.message-content {
  padding: 12px 14px;
  border: 1px solid #dce2e8;
  border-radius: 7px;
  color: #1d2939;
  background: #f8fafc;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.user .message-content { border-color: #276aa8; color: #ffffff; background: #276aa8; }

.typing-indicator {
  width: 64px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #dce2e8;
  border-radius: 7px;
  background: #f8fafc;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #667085;
  animation: pulse 1s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.3s; }

@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

.error-banner,
.notice-banner {
  margin: 0 20px 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid #f2b8b5;
  border-radius: 6px;
  color: #9b1c1c;
  background: #fff1f0;
  font-size: 13px;
}

.notice-banner {
  border-color: #a9d5b7;
  color: #116329;
  background: #eff9f2;
}

.error-banner span,
.notice-banner span { flex: 1; }
.error-banner button,
.notice-banner button { border: 0; color: inherit; background: transparent; }

.error-banner .retry-button {
  min-width: 72px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid currentColor;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.inline-error { margin: 0; }

.composer {
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
  border-top: 1px solid #eaecf0;
}

.composer textarea {
  width: 100%;
  min-width: 0;
  min-height: 76px;
  max-height: 180px;
  padding: 11px 12px;
  resize: vertical;
  border: 1px solid #b8c1cc;
  border-radius: 6px;
  color: #1d2939;
  background: #ffffff;
  line-height: 1.5;
}

.composer textarea:focus { outline: 2px solid #84b5e3; outline-offset: 1px; }
.composer textarea:disabled { color: #667085; background: #f2f4f7; }

.send-button {
  min-width: 96px;
  padding: 0 16px;
  border: 1px solid #1e5f99;
  color: #ffffff;
  background: #1e5f99;
}

button:disabled { cursor: not-allowed; opacity: 0.55; }

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(16 24 40 / 48%);
}

.settings-dialog {
  width: min(100%, 620px);
  max-height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 50px rgb(16 24 40 / 22%);
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 18px 20px;
  border-bottom: 1px solid #e4e7ec;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dialog-header h2 {
  margin: 0;
  color: #182230;
  font-size: 19px;
  letter-spacing: 0;
}

.dialog-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.settings-form {
  min-height: 0;
  overflow-y: auto;
}

.settings-form fieldset {
  margin: 0;
  padding: 18px 20px 20px;
  border: 0;
  border-bottom: 1px solid #eaecf0;
}

.settings-form legend {
  width: 100%;
  margin: 0 0 14px;
  padding: 0;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

.form-field {
  margin-bottom: 15px;
  display: block;
}

.form-field:last-child { margin-bottom: 0; }

.form-field > span {
  margin-bottom: 6px;
  display: block;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

.form-field input,
.form-field select {
  width: 100%;
  height: 42px;
  padding: 0 11px;
  border: 1px solid #b8c1cc;
  border-radius: 6px;
  color: #1d2939;
  background: #ffffff;
  font-size: 14px;
}

.form-field input:focus,
.form-field select:focus {
  outline: 2px solid #84b5e3;
  outline-offset: 1px;
}

.form-field small {
  margin-top: 5px;
  display: block;
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}

.secret-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
}

.secret-input input {
  border-radius: 6px 0 0 6px;
}

.secret-input button {
  border: 1px solid #b8c1cc;
  border-left: 0;
  border-radius: 0 6px 6px 0;
  color: #475467;
  background: #f8fafc;
}

.check-row {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #475467;
  font-size: 13px;
}

.check-row input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #1e5f99;
}

.config-loading {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #667085;
  font-size: 14px;
}

.config-warning,
.config-result {
  margin: 16px 20px 0;
  padding: 10px 12px;
  border: 1px solid #f0c36a;
  border-radius: 6px;
  color: #7a4d08;
  background: #fff8e8;
  font-size: 13px;
  line-height: 1.5;
}

.config-result {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-result.failed {
  border-color: #f2b8b5;
  color: #9b1c1c;
  background: #fff1f0;
}

.config-result.success {
  border-color: #a9d5b7;
  color: #116329;
  background: #eff9f2;
}

.dialog-footer {
  position: sticky;
  bottom: 0;
  padding: 14px 20px;
  border-top: 1px solid #e4e7ec;
  background: #ffffff;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer button {
  min-height: 40px;
  padding: 0 15px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-weight: 600;
}

.cancel-button {
  border: 1px solid #b8c1cc;
  color: #344054;
  background: #ffffff;
}

.test-button {
  border: 1px solid #7b9dbc;
  color: #1e5f99;
  background: #f4f8fc;
}

.save-button {
  border: 1px solid #1e5f99;
  color: #ffffff;
  background: #1e5f99;
}

/* The conversation keeps the existing page shell, but gives the working area a focused agent surface. */
.unified-conversation {
  color: #253042;
  background: #fbfcfe;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
}

.conversation-toolbar {
  position: sticky;
  top: -24px;
  z-index: 8;
  min-height: 66px;
  margin: -24px calc(-1 * clamp(18px, 4vw, 56px)) 24px;
  padding: 12px clamp(18px, 4vw, 56px);
  border-bottom: 1px solid #e6eaf0;
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.conversation-identity,
.conversation-identity > div,
.conversation-mode,
.report-heading-meta,
.empty-status-row,
.followup-suggestions,
.composer-actions {
  display: flex;
  align-items: center;
}

.conversation-identity { gap: 10px; }
.conversation-identity > div { min-width: 0; align-items: flex-start; flex-direction: column; gap: 1px; }
.conversation-identity span:not(.agent-mark) { color: #7b8494; font-size: 11px; }
.conversation-identity strong { color: #1e2939; font-size: 14px; font-weight: 700; }

.agent-mark,
.empty-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #075985;
  background: #e0f2fe;
}

.agent-mark {
  width: 34px;
  height: 34px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  font-size: 14px;
}

.conversation-mode {
  min-height: 28px;
  padding: 0 9px;
  gap: 6px;
  border: 1px solid #dbe5ee;
  border-radius: 6px;
  color: #526070;
  background: #f8fafc;
  font-size: 12px;
  white-space: nowrap;
}

.conversation-mode i { color: #0f766e; }

.conversation-empty {
  min-height: calc(100% - 164px);
  padding-bottom: 92px;
}

.empty-mark {
  width: 58px;
  height: 58px;
  margin-bottom: 17px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
}

.empty-mark i,
.empty-state .empty-mark i {
  margin: 0;
  color: #075985;
  font-size: 23px;
}

.empty-eyebrow {
  margin-bottom: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.conversation-empty h2 { color: #172033; font-size: 22px; }
.conversation-empty p { width: 100%; max-width: min(460px, calc(100vw - 72px)); padding: 0; box-sizing: border-box; color: #667085; line-height: 1.65; white-space: normal; }

.empty-status-row {
  margin-top: 22px;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.empty-status-row span {
  padding: 5px 8px;
  border: 1px solid #e1e8ef;
  border-radius: 5px;
  color: #667085;
  background: #ffffff;
  font-size: 11px;
}

.empty-status-row i { margin: 0 4px 0 0; color: #0f766e; font-size: 11px; }

.analysis-result { width: min(100%, 880px); }

.message-meta {
  color: #7b8494;
  font-size: 11px;
  font-weight: 700;
}

.message-content { border-color: #e2e8f0; background: #ffffff; box-shadow: 0 1px 2px rgb(15 23 42 / 3%); }
.message.user .message-content { border-color: #0f6fa8; background: #0f6fa8; box-shadow: 0 6px 18px rgb(15 111 168 / 14%); }

.image-message { max-width: min(76%, 680px); }
.image-message .message-content { border-radius: 8px; background: #f1f8fc; }
.image-message img { border-radius: 6px; }

.analysis-message-content {
  padding: clamp(18px, 3vw, 28px);
  border-color: #dce4ec;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 6%);
}

.analysis-result-header {
  margin-bottom: 18px;
  padding-bottom: 17px;
  border-bottom: 1px solid #e8edf2;
}

.report-heading { min-width: 0; }
.report-heading-meta { gap: 8px; }
.analysis-id { color: #8a94a3; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.analysis-result-header h2 { margin-top: 9px; color: #172033; font-size: 22px; }
.analysis-result-header p { color: #6b7788; }

.report-type {
  flex: 0 0 auto;
  margin-top: 2px;
  padding: 5px 7px;
  border: 1px solid #dbe5ee;
  border-radius: 5px;
  color: #526070;
  background: #f8fafc;
  font-size: 11px;
  white-space: nowrap;
}

.report-type i { margin-right: 4px; color: #0f766e; }

.stage-list {
  margin-bottom: 24px;
  border: 1px solid #e4eaf0;
  border-radius: 8px;
  overflow: hidden;
}

.stage-row {
  min-height: 56px;
  padding: 10px 13px;
  border-bottom-color: #edf1f5;
  background: #fcfdff;
}

.stage-row:last-child { border-bottom: 0; }
.stage-row > i { color: #0f766e; }
.stage-row > span { color: #677487; font-size: 11px; }

.ai-assessment-report,
.decision-block {
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
}

.ai-assessment-report { border-color: #e2e8f0; }
.decision-block { border: 1px solid #f4d7a3; border-left: 4px solid #b54708; }
.decision-block.ai_generated { border-color: #f5c4c0; border-left-color: #b42318; }
.decision-block.likely_non_ai { border-color: #b7dfc4; border-left-color: #16803c; }

.report-section { margin-bottom: 24px; }
.report-section h3 { padding-bottom: 9px; border-bottom: 1px solid #e8edf2; color: #253042; }
.evidence-item summary { border-radius: 5px; }
.evidence-item[open] summary { padding: 0 8px; color: #172033; background: #f6f9fc; }
.evidence-item[open] > :not(summary) { margin-left: 8px; margin-right: 8px; }

.followup-suggestions {
  width: min(100%, 880px);
  margin: 18px auto 0;
  flex-wrap: wrap;
  gap: 8px;
}

.followup-suggestions > span { margin-right: 3px; color: #7b8494; font-size: 11px; font-weight: 700; }
.followup-suggestions button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d9e2ea;
  border-radius: 5px;
  color: #435268;
  background: #ffffff;
  font-size: 12px;
}
.followup-suggestions button:hover:not(:disabled) { border-color: #7db7d8; color: #075985; background: #f0f9ff; }

.composer.unified-composer {
  margin-top: 24px;
  padding-top: 16px;
  padding-bottom: 18px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  border-top: 1px solid #e1e8ef;
  box-shadow: 0 -10px 22px rgb(248 250 252 / 92%);
}

.attach-button {
  margin-bottom: 0;
  border-color: #cbd6e1;
  color: #526070;
  background: #ffffff;
}

.attach-button:hover { border-color: #7db7d8; color: #075985; background: #f0f9ff; }

.composer textarea {
  grid-column: 2;
  min-height: 46px;
  padding: 12px 13px;
  border-color: #cbd6e1;
  border-radius: 8px;
  background: #ffffff;
  font-size: 14px;
  line-height: 1.55;
}

.composer.unified-composer:not(:has(.attach-button)) textarea { grid-column: 1 / 3; }

.composer textarea:focus { border-color: #38a1d8; outline: 3px solid rgb(186 230 253 / 65%); }

.composer-actions { grid-column: 3; align-self: stretch; flex-direction: column; justify-content: flex-end; gap: 7px; }
.composer-hint { color: #8a94a3; font-size: 10px; text-align: center; white-space: nowrap; }
.send-button {
  min-width: 78px;
  min-height: 46px;
  padding: 0 13px;
  border-color: #0f6fa8;
  border-radius: 8px;
  background: #0f6fa8;
  box-shadow: 0 4px 10px rgb(15 111 168 / 18%);
}
.send-button:hover:not(:disabled) { border-color: #075985; background: #075985; }

.composer-attachment {
  border-color: #cfe1ec;
  border-radius: 8px;
  background: #f4f9fc;
}

.composer-attachment .analysis-option { margin: 6px 0 0; }

@media (max-width: 900px) {
  .conversation-toolbar { top: -16px; margin-top: -16px; }
}

@media (max-width: 900px) {
  .agent-page { flex-direction: column; }
  .layout-sidebar { flex: 0 0 auto; width: 100%; }
  .agent-main { padding: 16px; }
  .agent-workspace { height: auto; min-height: 680px; grid-template-columns: 1fr; }
  .status-panel { border-right: 0; border-bottom: 1px solid #e4e7ec; }
  .secondary-button { margin-top: 0; }
  .conversation-panel { min-height: 520px; }
  .right-workspace { min-height: 620px; }
}

@media (max-width: 560px) {
  .layout-sidebar,
  .status-panel { display: none; }
  .agent-main { min-width: 0; padding: 12px; overflow-x: hidden; }
  .agent-header { align-items: flex-start; flex-direction: column; }
  .agent-header-actions { width: 100%; justify-content: space-between; }
  .agent-header h1 { font-size: 22px; }
  .message { max-width: 92%; }
  .message-list { padding: 20px 14px; }
  .composer { grid-template-columns: 44px minmax(0, 1fr); padding: 12px; }
  .composer .send-button { width: 100%; grid-column: 1 / -1; }
  .dialog-backdrop { padding: 0; align-items: flex-end; }
  .settings-dialog { width: 100%; max-height: 92vh; border-radius: 8px 8px 0 0; }
  .dialog-header,
  .settings-form fieldset { padding-left: 16px; padding-right: 16px; }
  .dialog-footer { padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; }
  .cancel-button { grid-column: 1 / -1; order: 3; }
  .analysis-panel { padding: 18px 14px; }
  .agent-workspace,
  .right-workspace { min-height: 560px; }
  .upload-zone { min-height: 230px; }
  .upload-zone img { height: 260px; }
  .upload-workspace { min-height: 360px; margin: 0 auto; }
  .composer-attachment { grid-template-columns: 80px minmax(0, 1fr) 38px; }
  .composer-attachment img { width: 80px; height: 70px; }
  .assessment-columns { grid-template-columns: 1fr; gap: 12px; }
  .ai-assessment-report { padding: 14px; }
  .image-message { max-width: 94%; }
  .analysis-message { max-width: 100%; }
  .analysis-message-content { padding: 14px; }
  .composer.unified-composer {
    margin-left: -14px;
    margin-right: -14px;
    grid-template-columns: 44px minmax(0, 1fr);
  }
  .conversation-toolbar {
    top: -18px;
    min-height: 60px;
    margin: -18px -14px 18px;
    padding: 10px 14px;
  }
  .conversation-mode { display: none; }
  .conversation-empty { min-height: 320px; padding: 20px 12px 112px; }
  .conversation-empty h2 { font-size: 20px; }
  .conversation-empty p { width: 310px; max-width: calc(100vw - 48px); }
  .empty-status-row { max-width: 250px; }
  .report-type { display: none; }
  .analysis-result-header h2 { font-size: 20px; }
  .stage-row { padding-left: 10px; padding-right: 10px; }
  .followup-suggestions { gap: 6px; }
  .followup-suggestions > span { width: 100%; }
  .followup-suggestions button { flex: 1 1 auto; }
  .composer-actions {
    grid-column: 1 / -1;
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
  }
  .composer-actions .send-button { width: auto; min-width: 76px; }
  .composer-hint { margin-right: auto; }
  .decision-block { align-items: flex-start; flex-direction: column; }
  .localization-metrics { grid-template-columns: 1fr; }
}
</style>
