from transformers import AutoModelForVision2Seq, AutoProcessor, BitsAndBytesConfig
from transformers.video_utils import load_video
from pathlib import Path
import torch
import logging

# ========== 日志配置 ==========
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("p1")

# ========== 模型路径 ==========
MODEL_NAME = "/sda/home/limingxin/1027_bieshan/video_analysis/qwen25vl"

_model = None
_processor = None


# ========== 模型加载 ==========
def load_qwen_model():
    """加载 Qwen2.5-VL 模型（量化 4-bit 优化显存）"""
    global _model, _processor
    if _model is None or _processor is None:
        logger.info(f"正在加载模型 {MODEL_NAME} ...")

        _processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)

        try:
            # 量化加载（4-bit，bfloat16 计算）
            quant_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
            _model = AutoModelForVision2Seq.from_pretrained(
                MODEL_NAME,
                quantization_config=quant_config,
                device_map="auto",
                trust_remote_code=True
            )
            logger.info("✅ 使用 4-bit 量化加载模型")
        except Exception as e:
            logger.warning(f"⚠️ 未启用量化加载 ({e})，使用常规方式加载模型。")
            _model = AutoModelForVision2Seq.from_pretrained(
                MODEL_NAME,
                device_map="auto",
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                trust_remote_code=True
            )

        _model.eval()
        logger.info("✅ 模型加载完成")
    return _model, _processor


# ========== 视频推理函数 ==========
def qwen_video_inference(video_path: str, prompt: str, num_frames: int = 16, max_tokens: int = 128) -> str:
    """
    使用 Qwen2.5-VL 生成视频语义描述（显存优化版）
    :param video_path: 视频文件路径
    :param prompt: 文本提示
    :param num_frames: 抽取的视频帧数（默认16）
    :param max_tokens: 生成的最大 token 数量（默认128）
    """
    try:
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"视频文件不存在: {video_path}")

        model, processor = load_qwen_model()

        # ✅ 加载视频帧
        loaded = load_video(str(video_path), num_frames=8)###
        video_frames = loaded[0] if isinstance(loaded, tuple) else loaded

        # ✅ 构建输入消息模板
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "video", "video_url": "video.mp4"},
                    {"type": "text", "text": prompt}
                ]
            }
        ]

        text_prompt = processor.apply_chat_template(messages, add_generation_prompt=True)

        # ✅ 构造输入张量
        inputs = processor(
            text=[text_prompt],
            videos=[video_frames],
            padding=True,
            return_tensors="pt"
        ).to(model.device)

        # ✅ 模型生成描述
        with torch.inference_mode(), torch.cuda.amp.autocast():
            generated_ids = model.generate(**inputs, max_new_tokens=max_tokens)

        output_text = processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True
        )[0].strip()

        # ========== 后处理（只保留视频内容描述） ==========
        if "assistant" in output_text:
            output_text = output_text.split("assistant")[-1].strip()
        if "user" in output_text:
            output_text = output_text.split("user")[0].strip()
        if "system" in output_text:
            output_text = output_text.replace("system", "").strip()
        output_text = output_text.replace("\n", " ").replace("  ", " ").strip()

        # ✅ 控制输出长度（最多200字）
        if len(output_text) > 200:
            output_text = output_text[:200] + "..."

        #logger.info(f"{output_text[:100]}...")
        return output_text

    except torch.cuda.OutOfMemoryError:
        logger.error("❌ GPU 显存不足，无法完成推理。")
        torch.cuda.empty_cache()
        return "视频描述生成失败：GPU 显存不足，请尝试更短视频或较小模型。"

    except Exception as e:
        logger.error(f"视频推理失败: {e}", exc_info=True)
        return f"视频描述生成失败: {str(e)}"


