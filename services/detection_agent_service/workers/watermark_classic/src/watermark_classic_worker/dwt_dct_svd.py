from __future__ import annotations

import cv2
import numpy as np
import pywt


# Compatible with ShieldMnt invisible-watermark 0.2.0 dwtDctSvd.py.
# Copyright (c) 2021 ShieldMnt, used under the MIT License.
class DwtDctSvdDecoder:
    def __init__(self, bit_count: int, scales: tuple[int, int, int] = (0, 36, 0), block_size: int = 4):
        self.bit_count = bit_count
        self.scales = scales
        self.block_size = block_size

    @staticmethod
    def _block_score(block: np.ndarray, scale: int) -> int:
        _left, singular_values, _right = np.linalg.svd(cv2.dct(block))
        return int(float(singular_values[0]) % scale > scale * 0.5)

    def _decode_frame(self, frame: np.ndarray, scale: int, scores: list[list[int]]) -> None:
        rows, columns = frame.shape
        index = 0
        for row in range(rows // self.block_size):
            for column in range(columns // self.block_size):
                block = frame[
                    row * self.block_size:(row + 1) * self.block_size,
                    column * self.block_size:(column + 1) * self.block_size,
                ]
                scores[index % self.bit_count].append(self._block_score(block, scale))
                index += 1

    def decode(self, image: np.ndarray) -> list[int]:
        rows, columns, _channels = image.shape
        yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
        scores: list[list[int]] = [[] for _ in range(self.bit_count)]
        for channel in range(2):
            scale = self.scales[channel]
            if scale <= 0:
                continue
            approximation, _details = pywt.dwt2(
                yuv[: rows // 4 * 4, : columns // 4 * 4, channel],
                "haar",
            )
            self._decode_frame(approximation, scale, scores)
        if any(not bit_scores for bit_scores in scores):
            raise ValueError("IMAGE_TOO_SMALL_FOR_PAYLOAD")
        return [int(float(np.mean(bit_scores)) * 255 > 127) for bit_scores in scores]
