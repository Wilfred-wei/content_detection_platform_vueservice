from __future__ import annotations

import cv2
import numpy as np
import pywt


# Compatibility follows ShieldMnt's released maxDct.py implementation. Despite
# the public method name "dwtDct", that implementation operates directly on
# 4x4 blocks of the Haar-DWT approximation rather than calling cv2.dct.
# Copyright (c) 2021 ShieldMnt, used under the MIT License; see
# THIRD_PARTY_NOTICES.md.


class DwtDctDecoder:
    """DWT-DCT decoder compatible with ShieldMnt invisible-watermark."""

    def __init__(self, bit_count: int, scales: tuple[int, int, int] = (0, 36, 36), block_size: int = 4):
        self.bit_count = bit_count
        self.scales = scales
        self.block_size = block_size

    @staticmethod
    def _block_score(block: np.ndarray, scale: int) -> int:
        position = int(np.argmax(np.abs(block.flatten()[1:]))) + 1
        row, column = divmod(position, block.shape[0])
        value = abs(float(block[row][column]))
        return int(value % scale > 0.5 * scale)

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
