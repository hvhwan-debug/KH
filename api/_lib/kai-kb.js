// Kho kiến thức chính sách Karofi/Livotec dùng cho trợ lí KAI, chia theo từng mục để chỉ gửi phần LIÊN QUAN
// tới câu hỏi (tránh gửi quá nhiều chữ mỗi lần hỏi, có thể vượt giới hạn độ dài của mô hình AI).
// Cập nhật: thêm mục mới vào mảng KAI_SECTIONS bên dưới (mỗi mục { title, text }).
const STATIC_SECTIONS = [
  { title: `Bảng giá sản phẩm Livotec (giá thuần đại lý, VNĐ)`, text: `# Bảng giá sản phẩm Livotec (giá thuần đại lý, VNĐ)
Lưu ý: đây là "Giá thuần đại lý" — giá bán cho Đại lý, chưa tính các chương trình khuyến mại/chiết khấu riêng (xem thêm các thông báo CTKM khác nếu có).

## BÌNH NƯỚC NÓNG
Đặc điểm chung dòng gián tiếp: Công nghệ IPUS giữ nước nóng lâu đến 48 giờ; Thanh đốt Titan Incoloy 840 tiết kiệm 30% điện năng, bảo hành vĩnh viễn; Thanh magie XMAS Mg+ lớn làm mềm nước, bảo vệ tóc da; ELCB tiêu chuẩn châu Âu an toàn gấp 5 lần; nhiệt độ ổn định tối đa 78°C.

| Model | Dung tích | Giá thuần đại lý |
|---|---|---|
| Livotec LWH-I20A25 | 20L | 2.641.000 |
| Livotec LWH-I30A25 | 30L | 3.078.000 |
| Livotec LWH-V15A25 | 15L | 2.318.000 |
| Livotec LWH-V20A25 | 20L | 2.579.000 |
| Livotec LWH-I20B26 | 20L | 2.538.000 |
| Livotec LWH-I30B26 | 30L | 2.994.000 |
| Livotec LWH-V15B26 | 15L | 2.303.000 |
| Livotec LWH-V20B26 | 20L | 2.383.000 |
| Livotec LWH-I20A26S (LED Display) | 20L | 2.943.000 |
| Livotec LWH-I30A26S (LED Display) | 30L | 3.424.000 |
| Livotec LWH-V15A26S (LED Display) | 15L | 2.532.000 |
| Livotec LWH-V20A26S (LED Display) | 20L | 2.864.000 |

Dòng B26/V26S/I26S thêm: Thanh đốt SUS316L bền bỉ, Thanh magie AZ63B cỡ lớn, Hệ thống 5 cấp an toàn, LED Display theo dõi nhiệt độ (bản A26S).

## BẾP TỪ
| Model | Loại | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|---|
| Livotec LIO-555V | Bếp từ đôi | Smart Inverter Đức, 2 IGBT 40A Infineon, 4800W, Booster | 5.154.000 |
| Livotec LIO-888VT | Bếp từ đôi | Smart Inverter Đức, 4 IGBT 40A, 4800W, Booster, nấu liu riu, điều khiển qua app AioTec WiFi | 7.425.000 |
| Livotec LID-980M | Bếp từ đôi | Nhập khẩu Malaysia, 2 IGBT 20A, 4400W, booster, nấu liu riu | 6.778.000 |
| Combo LID-980M (kèm nồi KMC-866) | Combo | — | 8.687.000 |
| Combo LID-980M + Máy hút mùi LRH-550 | Combo | — | 10.309.000 |
| Combo LIO-888VT + Máy hút mùi LRH-530 | Combo | — | 5.154.000 |
| Combo LIO-555V + Máy hút mùi LRH-530 | Combo | — | 7.425.000 |
| Livotec LIS-636 | Bếp từ đơn | IGBT Đức 2100W, 2 quạt tản nhiệt, mặt kính Eduraz bền x1.5, quà tặng 2 nồi lẩu 30cm | 1.696.000 |
| Livotec LIS-660C | Bếp từ đơn | IGBT Đức 2000W, Booster, tạm dừng linh hoạt, quà nồi lẩu 30cm | 1.378.000 |
| Livotec LIS-660P | Bếp từ đơn | (như LIS-660C) | 1.378.000 |
| Livotec LIS-660B | Bếp từ đơn | (như LIS-660C) | 1.378.000 |
| Livotec LIS-560P | Bếp từ đơn | IGBT Đức 2000W, Booster, chống tràn, quà nồi lẩu 30cm | 1.289.000 |
| Livotec LIS-560G | Bếp từ đơn | (như LIS-560P) | 1.289.000 |
| Livotec LIS-551 | Bếp từ đơn | Mâm nhiệt 2 lớp, 2000W, 6 chế độ nấu, quà nồi lẩu 28cm | 986.000 |
| Livotec LIS-826 | Bếp từ đơn | IGBT Đức 2100W, nấu liu riu, Quickstop chống tràn, cảm ứng chạm trượt, quà 2 nồi lẩu 30cm | 1.827.000 |

## MÁY HÚT MÙI
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LRH-550S | 3 tốc độ, 200W, lực hút 1300 m³/h, đèn LED, động cơ MaxPower, điều khiển vẫy tay MaxClean, tắt chậm SLOWOFF | 3.531.000 |
| Livotec LRH-550G | (như LRH-550S) | 3.531.000 |
| Livotec LRH-530S | 3 tốc độ + 1 Booster, 200W, lực hút 850 m³/h, Timer 9.0 hẹn giờ tắt | 2.619.000 |
| Livotec LRH-530G | (như LRH-530S) | 2.619.000 |

## QUẠT CÂY
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec S-100 | Boost Master, Turbo-Fan, Extension 120, Fast Angle, 3 cấp gió | 792.000 |
| Livotec S-200 (Xám/Xanh mint) | (như S-100) + chân đế đúc nguyên khối | 933.000 |
| Livotec S-400 (Xanh ghi/Vàng be/Xanh mint/Trắng) | Thêm: nâng hạ trợ lực lò xo, remote, Sleepy, hẹn giờ thông minh | 1.367.000 |
| Livotec S-150B | Boost Master 70m³/phút, Turbo-Fan mát xa 5m, Extension 120, Fast Angle đảo chiều 12 vòng/phút | 730.000 |

## QUẠT SÀN
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec FT-16 (Đen/Xanh) | Boost Master 83m³/phút, 90W, WideSwing 360 gập linh hoạt | 963.000 |
| Livotec FT-18 (Đen/Xanh) | Boost Master 100m³/phút, 100W, WideSwing 120 | 1.026.000 |

## QUẠT TREO TƯỜNG
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec W-100 (Trắng/Xanh mint/Xanh ghi/Xám) | Boost Master 70m³/phút, Turbo-Fan 7m/s, Widen 120° | 724.000 |
| Livotec W-400 (Xám/Xanh mint/Trắng/Xanh ghi) | Thêm: remote, 2 chế độ 3 cấp gió, Sleepy, hẹn giờ thông minh | 942.000 |

## QUẠT ĐIỀU HÒA (quạt hơi nước)
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LAC-G62 | Màng lọc Nano Silver, ion âm, điều khiển cảm ứng, có phao, gel khô/đá khô, hẹn giờ 12h, bảo hành 12 tháng | 2.355.000 |
| Livotec LAC-G60 | Gió mát xa gấp 1.5 lần, tiết kiệm 25% điện, (các tính năng như G62) | 1.766.000 |
| Livotec LAC-G66P | Lưu lượng gió 10.600m³/h, làm mát đến 75m², bình chứa 75L hoạt động 24h, bảo hành 24 tháng | 3.157.000 |
| Livotec LAC-G66S | Động cơ đồng chống nước, làm mát đến 75m², điều khiển cảm ứng + remote, bảo hành 24 tháng | 4.182.000 |

## MÁY SƯỞI (máy sưởi gốm)
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LCH-1597D | AEROBOOST ấm nhanh 3 giây, lõi gốm PTC 1500W, 5 chế độ, Flex-Heat 15–35°C, hẹn giờ 24H, cảm ứng & remote, CE | 947.000 |
| Livotec LCH-2079T | TurboHeat, lõi gốm PTC 2000W, Swing-Heat 90°, 4 chế độ, Flex-Heat 15–35°C, hẹn giờ 24H, CE | 1.680.000 |
| Livotec LCH-2089T | 2000W, quạt tản nhiệt động cơ DC, 4 chế độ, nhiệt 15-40°C, hẹn giờ 12h, quay đảo chiều 60°, CE | 1.178.000 |

## QUẠT ĐIỀU HÒA / HÚT ẨM
(xem thêm mục Quạt điều hòa ở trên)

## MÁY HÚT ẨM
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LHD-25IH | Hút ẩm Block 25L/ngày, lọc Hepa H113 + ion âm, máy nén Piston đồng + Gas R290, bình 6L, 15 chế độ, hẹn giờ 24h | 5.352.000 |
| Livotec LHD-36IU | Turbo-Dry 36 lít/ngày, máy nén Piston đồng 10 năm, GREEN GAS R290, Gold Fin, UVC diệt khuẩn, Fresh Air ion âm, sấy quần áo AIR HOT, bình 4.2L | 5.809.000 |
| Livotec LHD-18IU | (như LHD-36IU) hút 18 lít/ngày, bình 2.2L | 4.053.000 |

## NỒI CHIÊN KHÔNG DẦU
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LAF-860M/N/C (6L, Xanh/Navy/Be) | 1600W, 4D Vision Glass, Fuchibo 360°, lưới chắn dầu OilShield | 2.429.000 |

## NỒI CƠM ĐIỆN
| Model | Loại | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|---|
| Livotec LRC-6218G (Xanh) | Cơ | UDO°, 700W, mâm nhiệt 3D, lòng Ceramic LFGB Đức, i-Cook 3.0 | 1.270.000 |
| Livotec LRC-6118P (Hồng) | Cơ | (như LRC-6218G) | 1.150.000 |
| Livotec LRC-6118B (Be) | Cơ | (như LRC-6218G) | 1.150.000 |
| Livotec LRC-E8218P (Tím) | Điện tử | UDO°Smart, 700W, 9 chế độ, lòng GANG dạng niêu 1.4kg, i-Cook 9.0 | 2.080.000 |
| Livotec LRC-E8218S (Xanh) | Điện tử | (như LRC-E8218P) | 2.080.000 |
| Livotec LRC-E8118P (Hồng) | Điện tử | UDO°Smart, 650W, 8 chế độ, lòng GANG 1.4kg, i-Cook 8.0 | 1.530.000 |
| Livotec LRC-5218C | 1.8L | UDO°, 700W, chống dính FDA Hoa Kỳ, i-Cook 3.0 | 895.000 |
| Livotec LRC-5118C | 1.8L | iCook 3.0, 700W, chống dính FDA Hoa Kỳ | 738.000 |

## MÁY XAY SINH TỐ
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LVB-522W/P (Trắng/Hồng) | XFresh99+Titan 500W, cối xay sinh tố & bình thủy tinh | 813.000 |
| Livotec LVB-622W/P (Trắng/Hồng) | (như trên) + xay khô & vắt cam | 951.000 |
| Livotec LVB-821W/P (Trắng/Hồng) | (như trên) + xay thịt, xay khô & bình thủy tinh | 1.134.000 |

## MÁY HÚT BỤI
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LV-99 (Trắng) | Nhỏ gọn 1.238g, EMO trợ lực, Tornado, HEPA 99.97%, động cơ BDC, pin 2000mAh/30 phút, sạc Type-C | 1.465.000 |
| Livotec LV-100 (Trắng) | Lực hút 20.000PA, Tornado, HEPA, pin 2000mAh/40 phút | 1.755.000 |
| Livotec LV-200 (Trắng) | Lực hút 25.000PA, EMO, HEPA, Onto 1 chạm, pin 2000mAh/30 phút | 2.684.000 |

## MÁY ÉP CHẬM
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Livotec LSJ-B68S / LSJ-M68S | Ép lạnh XFresh99, 150W, ống tiếp 113mm, lưới lọc 2 tầng, động cơ DC ép kiệt 99% | 1.717.000 |
| Livotec LSJ-B66S / LSJ-M66S | Ép lạnh XFresh99, 200W, ống tiếp 108mm | 1.773.000 |
| Livotec LSJ-M80S Plus | Ép lạnh XFresh99, 250W, ống tiếp 130mm | 2.180.000 |

## NỒI / CHẢO (Kochmax)
| Model | Mô tả ngắn | Giá thuần đại lý |
|---|---|---|
| Bộ nồi Kochmax KMC-866 | Đáy liền khối dày gấp 4 lần, đạt chuẩn Đức (LFGB) & Mỹ (FDA), tay cầm Handcold, nắp kính cường lực | 2.782.000 |
| Chảo Kochmax KMP-28 | (như trên) | 1.042.000 |

---
Ghi chú: Giá trên là bảng giá thuần đại lý tham khảo; các chương trình khuyến mại (CTKM) riêng theo từng thời điểm có thể có giá ưu đãi khác — xem thêm các thông báo CTKM tương ứng (ví dụ: CTKM mùa đông bình nước nóng, CTKM gói gia dụng hội nghị...).` },
  { title: `CTKM Gói gia dụng (Hội nghị 2026) — Bảng giá ưu đãi dành cho Đại lý`, text: `# CTKM Gói gia dụng (Hội nghị 2026) — Bảng giá ưu đãi dành cho Đại lý
**Thời gian áp dụng:** Từ ngày 01/03/2026 đến hết ngày 31/06/2026.
Đây là chương trình khuyến mại combo "mua số lượng tặng hàng" cho Đại lý, áp dụng trên các nhóm sản phẩm gia dụng Livotec. Giá ĐL Theo CTKM thấp hơn giá ĐL thường, kèm điều kiện tặng hàng theo số lượng mua.

Định dạng: Mã model — Giá ĐL thường — Giá ĐL theo CTKM — Điều kiện tặng hàng

## Bình nước nóng
- LWH-I20A25: 2.882.000 → 2.348.000 — Mua 4 tặng 1
- LWH-I30A25: 3.307.000 → 2.624.000 — Mua 4 tặng 1
- LWH-V15A25: 2.423.000 → 2.154.000 — Mua 4 tặng 1
- LWH-V20A25: 2.712.000 → 2.298.000 — Mua 4 tặng 1
- LWH-ID20: 2.712.000 → 2.246.000 — Mua 4 tặng 1
- LWH-ID30: 3.052.000 → 2.538.000 — Mua 4 tặng 1

## Quạt điều hòa
- LAC-G66P: 5.942.000 → 3.157.000 — Mua 8 tặng 1
- LAC-G66S: 6.452.000 → 3.537.000 — Mua 8 tặng 1
- LAC-G60: 2.040.000 → 1.562.000 — Mua 15 tặng 1
- LAC-G62: 2.720.000 → 2.083.000 — Mua 10 tặng 1

## Quạt cây
- S-100: 1.020.000 → 691.000 — Mua 5 tặng 1
- S-200: 1.275.000 → 815.000 — Mua 5 tặng 1
- S-400: 1.870.000 → 1.163.000 — Mua 6 tặng 1

## Quạt treo tường
- W-100: 731.000 → 609.000 — Mua 10 tặng 1
- W-400: 893.000 → 753.000 — Mua 10 tặng 1

## Quạt sàn
- FT-16: 1.445.000 → 955.000 — Mua 5 tặng 1
- FT-18: 1.573.000 → 1.017.000 — Mua 5 tặng 1

## Máy sưởi gốm
- LCH-2089T: 1.573.000 → 1.071.000 — Mua 6 tặng 1
- LCH-1597D: 1.394.000 → 861.000 — Mua 6 tặng 1
- LCH-2079T: 2.040.000 → 1.527.000 — Mua 6 tặng 1

## Máy hút ẩm
- LHD-36IU: 6.681.000 → 5.281.000 — Mua 10 tặng 1
- LHD-25IH: 6.469.000 → 4.706.000 — Mua 10 tặng 1
- LHD-18IU: 4.921.000 → 3.685.000 — Mua 10 tặng 1

## Máy hút bụi
- LV-99: 1.530.000 → 1.332.000 — Mua 6 tặng 1
- LV-100: 2.295.000 → 1.595.000 — Mua 6 tặng 1
- LV-200: 3.188.000 → 2.441.000 — Mua 6 tặng 1

## Nồi Chảo cao cấp Kochmax
- Kochmax KMC-866 (bộ nồi): 3.154.000 → 2.524.000 — Mua 6 tặng 1
- Kochmax KMP-28 (chảo): 1.199.000 → 945.000 — Mua 6 tặng 1

## Bếp từ đôi
- LID-980M: 9.197.000 → 6.322.000 — Mua 7 tặng 1
- LID-980M (kèm nồi): 11.322.000 → 7.887.000 — Mua 7 tặng 1

## Bếp từ đơn
- LIS-636: 1.760.000 → 1.410.000 — Mua 4 tặng 1
- LIS-826: 1.947.000 → 1.550.000 — Mua 5 tặng 1
- LIS-560P / LIS-560G: 1.522.000 → 1.171.000 — Mua 5 tặng 1
- LIS-660C / LIS-660P / LIS-660B: 1.581.000 → 1.250.000 — Mua 5 tặng 1

## Nồi chiên không dầu
- LAF-860N / LAF-860C / LAF-860M: 2.780.000 → 2.207.000 — Mua 5 tặng 1

## Nồi cơm cơ
- LRC-6118P / LRC-6118B: 1.428.000 → 1.050.000 — Mua 6 tặng 1
- LRC-6218G: 1.556.000 → 1.148.000 — Mua 6 tặng 1

## Nồi cơm điện tử
- LRC-E8118P: 1.947.000 → 1.389.000 — Mua 6 tặng 1
- LRC-E8218S / LRC-E8218P: 2.601.000 → 1.882.000 — Mua 5 tặng 1

## Máy ép chậm
- LSJ-B66S / LSJ-M66S: 2.295.000 → 1.773.000 — Mua 5 tặng 1
- LSJ-B68S / LSJ-M68S: 2.176.000 → 1.717.000 — Mua 5 tặng 1
- LSJ-M80S Plus: 2.992.000 → 2.180.000 — Mua 5 tặng 1

## Máy xay sinh tố dòng nhỏ
- LVB-522W / LVB-522P: 1.114.000 → 813.000 — Mua 5 tặng 1
- LVB-622W / LVB-622P: 1.284.000 → 951.000 — Mua 5 tặng 1
- LVB-821W / LVB-821P: 1.530.000 → 1.134.000 — Mua 5 tặng 1

## Máy hút mùi
- LRH-530: 4.106.000 → 2.378.000 — Mua 6 tặng 1
- LRH-550S: 4.760.000 → 2.874.000 — Mua 6 tặng 1

## Quà tặng gói đăng ký điều hòa một chiều Livotec Inverter-DH12 + Bình nước nóng GBO-80
(mua combo điều hòa + bình nước nóng, từ 01/03/2026 đến hết 31/06/2026, tặng chọn 1 trong 2 ở mỗi nhóm):
- Tặng 1: 01 Quạt S-400, hoặc 01 Bếp từ đơn LIS-660C/P/B, hoặc 01 Máy hút bụi LV-100
- Tặng 2: 01 Quạt S-200, hoặc 01 Bình tắm nước nóng ID20
- Tặng 3: 02 Nồi cơm LRC-6218G, hoặc 01 Quạt điều hòa LAC-G66S, hoặc 02 Quạt S-100` },
  { title: `Bảng mã lỗi điều hòa DHV dòng I`, text: `# Bảng mã lỗi điều hòa DHV dòng I

BẢNG MÃ LỖI VÀ CÁCH XỬ LÍ

                                                                                                               DHV I

Mã lỗi                Tên lỗi và Trạng thái                                 Phương pháp xử lý (Kiểm tra theo từng bước)

 A3      Chế độ thu hồi môi chất lạnh

 C0      Lỗi nắp Jumper trên dàn lạnh

                                                           Kiểm tra mạch có bị hư hại, hỏng hóc không? Nếu có thì thay mạch
         Lỗi mạch phát hiện điểm không (zero-crossing)
 C1
         của điện áp AC dàn lạnh

                                                           1: Kiểm tra xem điện áp nguồn cấp. Nếu điện áp thấp <165V thì hãy tắt nguồn và bật
                                                           nguồn lại, và sử dụng lioa để ổn định nguồn.
                                                           2: Kiểm tra lại dây nối động cơ có bị lỏng không? Nếu có thì cắm chặt lại.
 C2      Lỗi động cơ quạt dàn lạnh
                                                           3: Thay một mẫu động cơ thay thế vào để kiểm tra. Nếu động cơ hoạt động thì tiến
                                                           hành thay thế động cơ.
                                                           4: Tiến hành thay mạch

                                                           1: Kiểm tra xem dây kết nối có bị vấn đề không? Nếu có thay dây mới
         Lỗi giao tiếp giữa dàn lạnh và dàn nóng (dàn
 C3                                                        2: Kiểm tra đấu nối dây đã đúng chưa? Nếu không kết nối lại theo hướng dẫn
         lạnh phát hiện)
                                                           3: Tiến hành thay mạch cục lạnh kiểm tra? Nếu vẫn bị lỗi thì thay mạch cục nóng

                                                           1: Kiểm tra xem dây kết nối có bị vấn đề không? Nếu có thay dây mới
         Lỗi giao tiếp giữa dàn lạnh và dàn nóng (dàn
 C6                                                        2: Kiểm tra đấu nối dây đã đúng chưa? Nếu không kết nối lại theo hướng dẫn
         nóng phát hiện)
                                                           3: Tiến hành thay mạch cục lạnh kiểm tra? Nếu vẫn bị lỗi thì thay mạch cục lạnh

 CL      (Dự phòng) Nhắc nhở vệ sinh bộ lọc

                                                       1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu chưa tiến hành
                                                       nối lại cho đúng.
         Lỗi cảm biến nhiệt độ môi trường dàn lạnh (hở
 E0                                                    2: Tiến hành đo điện trở cảm biến tại 25°C (15KΩ±3%). Nếu giá trị lệch quá nhiều hoặc
         mạch hoặc ngắn mạch)
                                                       bị hỏng thì tiến hành thay dây
                                                       3: Thay thế mạch

                                                           1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu chưa tiến hành
                                                           nối lại cho đúng.
         Lỗi cảm biến nhiệt độ đường ống dàn lạnh (hở
 E1                                                        2: Tiến hành đo điện trở cảm biến tại 25°C (20KΩ±3%). Nếu giá trị lệch quá nhiều hoặc
         mạch hoặc ngắn mạch)
                                                           bị hỏng thì tiến hành thay dây
                                                           3: Thay thế mạch

                                                           1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu chưa tiến hành
                                                           nối lại cho đúng.
         Lỗi cảm biến nhiệt độ môi trường dàn nóng
 E2                                                        2: Tiến hành đo điện trở cảm biến tại 25°C (15KΩ±3%). Nếu giá trị lệch quá nhiều hoặc
         (hở mạch hoặc ngắn mạch)
                                                           bị hỏng thì tiến hành thay dây
                                                           3: Thay thế mạch

                                                           B1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu chưa tiến
                                                           hành nối lại cho đúng.
         Lỗi cảm biến nhiệt độ đường ống dàn nóng
 E3                                                        B2: Tiến hành đo điện trở cảm biến tại 25°C (20KΩ±3%). Nếu giá trị lệch quá nhiều tiến
         (hở mạch hoặc ngắn mạch)
                                                           hành thay dây
                                                           B3: Thay thế mạch

                                                           B1: kiểm tra xem dây đã được đấu nối đúng chưa? Nếu chưa tiến hành nối lại cho
                                                           đúng.
         Lỗi cảm biến nhiệt độ đầu đẩy máy nén dàn
 E4                                                        2: Tiến hành đo điện trở cảm biến tại 25°C (50KΩ±3%). Nếu giá trị lệch quá nhiều hoặc
         nóng (hở mạch hoặc ngắn mạch)
                                                           bị hỏng thì tiến hành thay dây
                                                           B3: Thay thế mạch

         Lỗi cảm biến nhiệt độ mô-đun IPM máy nén
 E5                                                        Tiến hành thay mạch
         (hở mạch hoặc ngắn mạch)

 E8      Lỗi (hỏng) cảm biến nhiệt độ đường đẩy

 H0      Bảo vệ quá nhiệt đường đẩy máy nén

 H1      Bảo vệ quá tải hệ thống                           Tiến hành vệ sinh dàn nóng và lạnh

 H3      Bảo vệ chống đóng băng

 L0      Bảo vệ máy nén mất đồng bộ
                                                           1: Kiểm tra xem các chân dây nối máy nén đã nối đúng chưa?
                                                            2: Kiểm tra xem chênh lệch áp suất hệ thống có quá cao không, hoặc hệ thống có
 L1      Bảo vệ máy nén khởi động thất bại
                                                           đang bị tắc nghẽn ở đâu đó không.
 L2      Bảo vệ dòng điện đỉnh máy nén                      3: Kiểm tra xem lượng gas trong hệ thống có đang bị nạp quá nhiều hay không? Nếu
                                                           có thì xả bớt
 L4      Bảo vệ mô-đun IPM máy nén                          4:Đo kiểm tra cuộn dây máy nén xem có bị chạm vỏ, đứt cuộn dây, lệch pha hoặc máy
                                                           nén có bị kẹt cơ không? Nếu có thì thay máy mới
 L3      Bảo vệ dòng điện hiệu dụng máy nén                 5: Thay bo mạch

                                                           1: Kiểm tra vít mô đun IPM có bị lỏng không? Nếu có hãy siết chặt lại.
         Bảo vệ quá nhiệt mô-đun công suất (IPM) của
 L5                                                        2: Kiểm tra dàn ngưng có bị tắc nghẽn hay bẩn không? Nếu có hãy làm sạch
         máy nén
                                                           3: Thay mạch rồi kiểm tra lại

 L6      Bảo vệ lỗi mạch phát hiện dòng điện máy nén

 L7      Bảo vệ mất pha máy nén

 L8      Bảo vệ động cơ quạt DC dàn nóng                   1: Kiểm tra xem động cơ của cục nóng có bị hư hỏng không? Nếu có tiến hành thay
                                                           động cơ
         Bảo vệ lỗi mạch phát hiện dòng điện quạt DC
 L9                                                        2: Mạch có bị hư hại không? Nếu có thay mạch cục nóng
         dàn nóng

 SC      Chức năng tự động làm sạch

 U0      Lỗi bộ nhớ EEPROM dàn nóng                        Đây là lỗi chương trình bo mạch => thay mạch

 U1      Lỗi nạp điện dàn nóng                             1: Kiểm tra xem điện áp nguồn cấp. Nếu điện áp thấp <165V thì hãy tắt nguồn và bật
                                                           nguồn lại, và sử dụng lioa để ổn định nguồn.
         Bảo vệ điện áp xoay chiều dàn nóng bất            2: Tiến hành thay mạch
 U2
         thường

                                                           1: Kiểm tra kết nối dây nguồn. Dây có bị lỏng hoặc đấu nhầm không? Nếu có thì tiến
                                                           hành nối đúng thứ tự và siết chặt lại.
                                                            2: Nguồn điện có quá cao hay quá thấp không? Nếu có điều chỉnh hoặc ổn định lại
 U3      Bảo vệ điện áp DC dàn nóng quá cao                nguồn điện
                                                            3: Mạch có bị hư hỏng linh kiện không? Nếu bo mạch lỗi, hệ thống sẽ tự động khôi
                                                           phục sau khi trạng thái bảo vệ kết thúc (tuy nhiên, nếu hư hỏng nặng cần kiểm tra và
                                                           thay thế bo mạch)

                                                           1: Kiểm tra kết nối dây nguồn. Dây có bị lỏng hoặc đấu nhầm không? Nếu có thì tiến
                                                           hành nối đúng thứ tự và siết chặt lại.
                                                           2: Nguồn điện có quá cao hay quá thấp không? Nếu có điều chỉnh hoặc ổn định lại
 U4      Bảo vệ điện áp DC dàn nóng quá thấp
                                                           nguồn điện
                                                           3: Điện áp có đang ở mức quá thấp hoặc có hiện tượng sụt áp đột ngột không? Nếu có
                                                           hệ thống sẽ tự động khôi phục sau khi điện áp ổn định trở lại.

 U5      Bảo vệ sụt áp điện áp DC dàn nóng

         Bảo vệ dòng điện xoay chiều dàn nóng bất
 U6
         thường

         Bảo vệ dòng điện xoay chiều hiệu dụng dàn
 U7
         nóng quá cao

         Bảo vệ lỗi mạch phát hiện dòng điện PFC dàn
 U8
         nóng

 U9      Bảo vệ mạch PFC` },
  { title: `Bảng mã lỗi điều hòa DHV dòng J`, text: `# Bảng mã lỗi điều hòa DHV dòng J

BẢNG MÃ LỖI VÀ CÁCH XỬ LÍ

                                                                                        DHV J

Mã lỗi    Mô tả chi tiết                      Phương pháp xử lý (Kiểm tra theo từng bước)

                                              1: Kiểm tra xem điện áp nguồn cấp. Nếu điện áp thấp <165V thì hãy tắt
                                              nguồn và bật nguồn lại, và sử dụng lioa để ổn định nguồn.
                                               2: Kiểm tra lại dây nối động cơ có bị lỏng không? Nếu có thì cắm chặt
     C2   Lỗi mô tơ quạt dàn lạnh             lại.
                                               3: Thay một mẫu động cơ thay thế vào để kiểm tra. Nếu động cơ hoạt
                                              động thì tiến hành thay thế động cơ.
                                               4: Tiến hành thay mạch

                                             1: Kiểm tra xem dây kết nối có bị vấn đề không? Nếu có thay dây mới
                                              2: Kiểm tra đấu nối dây đã đúng chưa? Nếu không kết nối lại theo
          Lỗi giao tiếp giữa dàn lạnh và dàn
     C3                                      hướng dẫn
          nóng
                                              3: Tiến hành thay mạch cục lạnh kiểm tra? Nếu vẫn bị lỗi thì thay mạch
                                             cục nóng

     C5   Lỗi bộ nhớ EEPROM dàn lạnh

                                              1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu
          Cảm biến nhiệt độ môi trường        chưa tiến hành nối lại cho đúng.
     E0   dàn lạnh bị hở mạch hoặc ngắn        2: Tiến hành đo điện trở cảm biến tại 25°C (10KΩ±1%). Nếu giá trị lệch
          mạch                                quá nhiều hoặc bị hỏng thì tiến hành thay dây
                                               3: Thay thế mạch

                                         1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu
                                         chưa tiến hành nối lại cho đúng.
          Cảm biến nhiệt độ ống đồng dàn
     E1                                   2: Tiến hành đo điện trở cảm biến tại 25°C (10KΩ±1%). Nếu giá trị lệch
          lạnh bị hở mạch hoặc ngắn mạch
                                         quá nhiều hoặc bị hỏng thì tiến hành thay dây
                                          3: Thay thế mạch

                                              1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu
          Cảm biến nhiệt độ môi trường        chưa tiến hành nối lại cho đúng.
     E2   dàn nóng bị hở mạch hoặc ngắn        2: Tiến hành đo điện trở cảm biến tại 25°C (10KΩ±1%). Nếu giá trị lệch
          mạch                                quá nhiều hoặc bị hỏng thì tiến hành thay dây
                                               3: Thay thế mạch

                                              1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu
          Cảm biến nhiệt độ ống đồng dàn      chưa tiến hành nối lại cho đúng.
     E3   nóng bị hở mạch hoặc ngắn            2: Tiến hành đo điện trở cảm biến tại 25°C (10KΩ±1%). Nếu giá trị lệch
          mạch                                quá nhiều hoặc bị hỏng thì tiến hành thay dây
                                               3: Thay thế mạch

                                              1: kiểm tra xem dây đã được đấu nối đúng hay đã cắm chặt chưa? Nếu
                                              chưa tiến hành nối lại cho đúng.
          Cảm biến nhiệt độ đầu đẩy máy
     E4                                        2: Tiến hành đo điện trở cảm biến tại 25°C (50KΩ±1%). Nếu giá trị lệch
          nén bị hở mạch hoặc ngắn mạch
                                              quá nhiều hoặc bị hỏng thì tiến hành thay dây
                                               3: Thay thế mạch

          Bảo vệ quá nhiệt nhiệt độ đầu       1: Kiểm tra dàn ngưng có bị tắc nghẽn hay bẩn hoặc không giải nhiệt
     E5
          đẩy                                 được không? Nếu có hãy làm sạch

     E6   Bảo vệ chống đóng băng

          Bảo vệ quá tải hệ thống (Bảo vệ     1: Kiểm tra dàn ngưng có bị tắc nghẽn hay bẩn hoặc không giải nhiệt
     E7
          quá nhiệt dàn nóng)                 được không? Nếu có hãy làm sạch

     L0   Bảo vệ mất đồng bộ máy nén          1: Kiểm tra xem các chân dây nối máy nén đã nối đúng chưa?
                                               2: Kiểm tra xem chênh lệch áp suất hệ thống có quá cao không, hoặc hệ
     L1   Lỗi khởi động máy nén               thống có đang bị tắc nghẽn ở đâu đó không.
                                               3: Kiểm tra xem lượng gas trong hệ thống có đang bị nạp quá nhiều hay
          Bảo vệ dòng điện đỉnh của máy       không? Nếu có thì xả bớt
     L2
          nén                                  4:Đo kiểm tra cuộn dây máy nén xem có bị chạm vỏ, đứt cuộn dây, lệch
                                              pha hoặc máy nén có bị kẹt cơ không? Nếu có thì thay máy mới
          Bảo vệ mô-đun công suất (IPM)
     L4                                        5: Thay bo mạch
          của máy nén

                                              1: Kiểm tra vít mô đun IPM có bị lỏng không? Nếu có hãy siết chặt lại.
          Bảo vệ quá nhiệt mô-đun công         2: Kiểm tra dàn ngưng có bị tắc nghẽn hay bẩn không? Nếu có hãy làm
     L5
          suất (IPM) của máy nén              sạch
                                               3: Thay mạch rồi kiểm tra lại

          Bảo vệ lỗi mạch cảm biến dòng
     L6
          điện máy nén

     L8   Lỗi mô tơ quạt DC dàn nóng

          Bảo vệ lỗi mạch cảm biến dòng
     L9
          điện mô tơ quạt DC dàn nóng

     U0   Lỗi bộ nhớ EEPROM dàn nóng

          Bảo vệ điện áp xoay chiều dàn
     U2
          nóng bất thường

                                              1: Kiểm tra kết nối dây nguồn. Dây có bị lỏng hoặc đấu nhầm không?
                                              Nếu có thì tiến hành nối đúng thứ tự và siết chặt lại.
                                              2: Nguồn điện có quá cao hay quá thấp không? Nếu có điều chỉnh hoặc
          Bảo vệ điện áp một chiều dàn
     U3                                       ổn định lại nguồn điện
          nóng quá cao hoặc vượt ngưỡng
                                              3: Mạch có bị hư hỏng linh kiện không? Nếu bo mạch lỗi, hệ thống sẽ tự
                                              động khôi phục sau khi trạng thái bảo vệ kết thúc (tuy nhiên, nếu hư
                                              hỏng nặng cần kiểm tra và thay thế bo mạch)

          Bảo vệ quá dòng điện xoay chiều
     U7
          dàn nóng

          Bảo vệ lỗi mạch cảm biến dòng
     U8
          điện PFC dàn nóng

     U9   Bảo vệ mạch PFC` },
  { title: `TB04d — Chính sách bán hàng dành cho Nhà Phân Phối (NPP) Livotec ngành Gia dụng và Điện gia dụng năm 2026`, text: `# TB04d — Chính sách bán hàng dành cho Nhà Phân Phối (NPP) Livotec ngành Gia dụng và Điện gia dụng năm 2026
(Số 04d/2026/TB-LVT, ngày 02/01/2026)

**Thời gian áp dụng:** Từ 01/01/2026 cho đến khi có thông báo mới.
**Đối tượng áp dụng:** NPP Livotec ngành Gia dụng và Điện gia dụng kênh GT toàn quốc, có thời gian hợp tác tối thiểu 3 tháng trở lên.
**Sản phẩm áp dụng:** Tất cả các sản phẩm của nhãn hàng Livotec (TRỪ Máy lọc nước, Điều hòa, và các nhóm hàng có chính sách riêng).

## Chính sách bán hàng
1. **Chiết khấu thương mại:** 6% — Chiết khấu thương mại cho NPP 6.0% trên giá bán cho Đại Lý (ĐL). Giá NPP = Giá ĐL × (100% − 6%).
2. **Tiến độ thanh toán:**
   - Đợt 1: 10% — thanh toán trong vòng 24h kể từ khi đặt hàng.
   - Đợt 2: 90% — thanh toán trong vòng 30 ngày kể từ khi nhận hàng.
3. **Chiết khấu thanh toán trước giao hàng:** 1.2% trên giá trị đơn hàng chưa bao gồm thuế GTGT, khi NPP thanh toán 100% giá trị đơn hàng bao gồm thuế GTGT trước khi giao hàng.
4. **Hạn mức công nợ tối đa:** Hỗ trợ tối đa không quá doanh thu trung bình 1.5 tháng bán hàng.
5. **Hỗ trợ bán hàng:** 2.0% — áp dụng cho khu vực NPP không có Đại diện kinh doanh Livotec.
6. **Thưởng hoàn thành mục tiêu doanh số tháng:** Đạt ≥ 100% chỉ tiêu doanh số tháng → thưởng 2.0%.
7. **Thưởng hoàn thành mục tiêu doanh số quý:**
   - 7.a Đạt ≥ 100% chỉ tiêu doanh số quý → thưởng 3.0%.
   - 7.b Hỗ trợ thưởng cho các tháng không đạt mục tiêu khi NPP đạt ≥ 100% chỉ tiêu doanh số quý → thưởng thêm 2.0% (tính theo doanh số các tháng chưa được thưởng trong quý).
8. **Thưởng hoàn thành mục tiêu năm:**
   - 8.a Đạt ≥ 80% chỉ tiêu doanh số năm → thưởng 0.5%.
   - 8.b Đạt ≥ 100% chỉ tiêu doanh số năm → thưởng 1.0%.

   Các trường hợp KHÔNG được xét trả thưởng tháng/quý/năm:
   1. Có công nợ quá hạn tính đến thời điểm 31/12/2026.
   2. Gộp sổ cùng với NPP khác.
   3. Bán phá giá.
   4. Còn đơn hàng chưa kéo tính đến thời điểm 31/01/2027.
   5. Không còn hợp tác với Livotec tính đến thời điểm trả thưởng.
   6. Không ký biên bản đối chiếu công nợ tháng/năm.

## Các quy định chung
- NPP không có công nợ quá hạn tính đến ngày chốt cuối cùng của giai đoạn tính thưởng và đã có biên bản xác nhận công nợ được ký chốt giữa hai bên của tháng liền kề trước đó.
- Livotec sẽ trả thưởng khi khách hàng đã nhận toàn bộ hàng hóa nằm trong danh mục hàng hóa đủ điều kiện tính thưởng theo thời gian quy định. Trừ trường hợp hàng hóa chưa giao thuộc lỗi của Livotec hoặc không nằm trong danh mục hàng hóa đủ điều kiện tính thưởng.
- Doanh số tính thưởng: tính trên giá NPP sau khi trừ các khoản giảm giá, voucher (nếu có) và chưa bao gồm thuế GTGT. Mức thưởng cho NPP đã bao gồm thuế GTGT.
- Thời gian trả thưởng tháng/quý: ngày 15 hoặc ngày 30 của tháng kế tiếp/tháng đầu của quý kế tiếp, kể từ thời điểm NPP nhận đủ hàng theo điều kiện trả thưởng.
- Thời gian trả thưởng năm: ngày 15 tháng 02 năm kế tiếp.
- Hình thức trả thưởng: đối trừ công nợ.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB147 — Chính sách bán hàng dành cho Đại Lý điện máy nhập hàng trực tiếp từ Livotec 2026`, text: `# TB147 — Chính sách bán hàng dành cho Đại Lý điện máy nhập hàng trực tiếp từ Livotec 2026
(Số 147/2025/TB-LVT, ngày 31/12/2025)

**Thời gian áp dụng:** Từ 02/01/2026 cho tới khi có thông báo mới.
**Đối tượng áp dụng:** Đại lý (ĐL) kênh GT toàn quốc, điện máy nhập hàng trực tiếp từ Livotec thông qua Đại diện kinh doanh Livotec trên toàn quốc.
**Sản phẩm áp dụng:** Tất cả các sản phẩm và linh kiện của nhãn hàng Livotec (trừ các nhóm có chính sách riêng).

## Chính sách bán hàng
1. **Giá bán dành cho ĐL:** Giá ĐL điện máy trực tiếp = Giá NPP × (100% + 3%). Giá NPP là giá ban hành theo CTKM được thông báo theo từng giai đoạn.
2. **Tiến độ thanh toán:** Thanh toán trước giao hàng — thanh toán 100% giá trị đơn hàng trước ngày giao hàng.
3. **Chiết khấu thanh toán:** 2.0% trên giá trị đơn hàng (chưa VAT) khi ĐL thanh toán 100% giá trị đơn hàng trước ngày giao hàng.

## Các quy định chung
- Đơn hàng của ĐL trực tiếp phải có sự xác nhận của Đại diện kinh doanh Livotec khu vực.
- Livotec sẽ chi trả các khoản thưởng khi nhận được hợp đồng từ ĐL.
- Chính sách bán hàng được áp dụng với đơn đặt hàng có giá trị tối thiểu 10 triệu đồng/đơn.
- ĐL trực tiếp được tham gia các Chương trình khuyến mại khác theo quy định của từng Chương trình.
- Chính sách này không áp dụng cho kênh bán hàng Online.
- Hình thức trả thưởng: được đối trừ trực tiếp ngay trên đơn hàng.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB150 — Chương trình đầu tư biển bảng, quầy kệ sản phẩm theo mùa vụ (BBQK)`, text: `# TB150 — Chương trình đầu tư biển bảng, quầy kệ sản phẩm theo mùa vụ (BBQK)
(Số 150/2025/TB-LVT, ngày 31/12/2025)

**Đối tượng áp dụng:** Đại Lý (ĐL) Livotec kênh GT.
**Thời gian áp dụng:** Từ ngày 01/01/2026 đến hết ngày 31/12/2026.

## Nội dung: ĐL nhập hàng và nhận gói đầu tư hình ảnh
| Nhóm sản phẩm | Số máy ĐL nhập | Quà tặng | Thông số kĩ thuật | Giá trị đầu tư (VNĐ, +VAT) |
|---|---|---|---|---|
| Điều hòa | ≥ 15 máy | 01 Bộ kệ vách Điều hòa VIP & mockup | 1800x650x2400 mm | ~15.000.000 |
| Bếp từ | ≥ 5 bếp từ đôi | 01 Kệ vách bếp từ | 1200x680x2700 mm | ~12.000.000 |
| Bếp từ | ≥ 10 bếp từ đôi | 01 Kệ đảo gia dụng VIP | 1900x900x1350 mm | ~15.000.000 |
| Bình nước nóng | ≥ 15 máy | 01 Bộ kệ trưng bày Mockup & Mockup | 1000x550x1700 mm | ~8.500.000 |
| Bình nước nóng | ≥ 30 máy | 01 Bộ kệ vách đa năng bình nóng VIP & Mockup | 1800x650x2400 mm | ~15.000.000 |

## Quy định triển khai
- ĐL nhập hàng thể hiện bằng việc quét nhập trên App KShop thông qua QR code hoặc serial.
- Trường hợp ĐL đã được Livotec đầu tư hình ảnh kể từ ngày 01/01/2025, Livotec sẽ đánh giá thực tế và chỉ đầu tư các hạng mục hình ảnh phù hợp với không gian trưng bày của ĐL, không trùng lặp với hạng mục đã được đầu tư. Trường hợp hạng mục đã đầu tư bị hư hỏng, xuống cấp việc tái đầu tư sẽ được Livotec xem xét và phê duyệt.
- ĐL cần kí biên bản cam kết và chỉ sử dụng quầy kệ được đầu tư để trưng bày các sản phẩm của Livotec trong tối thiểu 03 năm kể từ ngày lắp đặt.
- Đại lý chỉ được lựa chọn gói đầu tư hình ảnh tương ứng với 01 mức điều kiện đạt được, không được cộng dồn khi đồng thời thỏa mãn nhiều điều kiện.
- Thời gian trả thưởng: Livotec tổng kết hàng tháng và thực hiện trả thưởng trong vòng 45 ngày kể từ ngày cuối tháng mà ĐL đã nhập đủ số lượng máy theo gói đăng kí.
- Ưu đãi không được quy đổi thành tiền mặt hoặc sản phẩm khác.
- Hình thức trả thưởng: Livotec/Nhà thầu trực tiếp triển khai thi công tại ĐL.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB151 — Chương trình đầu tư biển bảng, quầy kệ Showroom`, text: `# TB151 — Chương trình đầu tư biển bảng, quầy kệ Showroom
(Số 151/2025/TB-LVT, ngày 31/12/2025)

**Đối tượng áp dụng:** Đại Lý (ĐL) Livotec kênh GT.
**Thời gian áp dụng:** Từ ngày 01/01/2026 đến hết ngày 31/12/2026.
**Sản phẩm áp dụng:** Tất cả sản phẩm mang thương hiệu Livotec (trừ máy lọc nước) được Livotec ban hành trong các Chương trình khuyến mại kể từ ngày 01/01/2025.

## Điều kiện và quà tặng
**Điều kiện (đáp ứng đủ cả 4):**
- Doanh số nhập hàng tích lũy trong 02 tháng liên tiếp (VNĐ, +VAT) ≥ 200.000.000.
- Cam kết doanh số bán ra hàng tháng (VNĐ, +VAT) ≥ 100.000.000.
- Trưng bày full kệ đầu tư.
- Đáp ứng điều kiện về mặt bằng, vị trí theo tiêu chuẩn hãng.

**Quà tặng khi đáp ứng đủ điều kiện:** Gói thiết kế Showroom + Đầu tư biển bảng quầy kệ, quầy lễ tân + Đầu tư PG.

## Chi tiết các hạng mục đầu tư hình ảnh
| STT | Hạng mục | Thông số kỹ thuật | Giá trị đầu tư (VND) |
|---|---|---|---|
| 1 | Kệ vách đa năng ngành khí | 1800x650x2400 mm | ~15.000.000 |
| 2 | Kệ vách đa năng ngành gia dụng | 1800x650x2400 mm | ~15.000.000 |
| 3 | Kệ vách bếp từ | 1200x680x2700 mm | ~12.000.000 |
| 4 | Kệ đảo gia dụng VIP | 1900x900x1350 | ~15.000.000 |
| 5 | Biển Alu/cột hình ảnh | Theo kích thước thực tế cửa hàng | ~29.000.000 |

## Quy định triển khai
- ĐL nhập hàng thể hiện bằng việc quét nhập trên App KShop thông qua QR code hoặc serial.
- Trường hợp ĐL đã được Livotec đầu tư hình ảnh kể từ ngày 01/01/2025, Livotec sẽ đánh giá thực tế và chỉ đầu tư các hạng mục hình ảnh phù hợp với không gian trưng bày của ĐL, không trùng lặp với hạng mục đã được đầu tư. Hạng mục hư hỏng/xuống cấp: tái đầu tư do Livotec xem xét và phê duyệt.
- ĐL cần kí biên bản cam kết và chỉ sử dụng quầy kệ được đầu tư để trưng bày các sản phẩm của Livotec trong tối thiểu 03 năm kể từ ngày lắp đặt.
- Đại lý cam kết chỉ trưng bày các sản phẩm Livotec tại Showroom. Trường hợp đặc biệt khi trưng bày sản phẩm hãng khác cần có sự thống nhất với Giám đốc kinh doanh Livotec và không vượt quá 10% tổng số lượng máy trưng bày tại cửa hàng.
- Đối với biển bảng: Livotec sẽ đánh giá và chi đầu tư khi cửa hàng nằm ở các vị trí ngã 3/ngã 4/mặt đường quốc lộ/mặt đường lớn có lưu lượng giao thông đông đúc.
- Đại lý chỉ được lựa chọn gói đầu tư hình ảnh tương ứng với 01 mức điều kiện đạt được, không được cộng dồn khi đồng thời thỏa mãn nhiều điều kiện.
- Thời gian trả thưởng: Livotec tổng kết hàng tháng và thực hiện trả thưởng trong vòng 45 ngày kể từ ngày cuối tháng mà ĐL đã nhập đủ số lượng máy theo gói đăng kí.
- Ưu đãi không được quy đổi thành tiền mặt hoặc sản phẩm khác.
- Hình thức trả thưởng: Livotec/Nhà thầu trực tiếp triển khai thi công tại ĐL.
- Livotec có quyền thu hồi các hạng mục đã đầu tư nếu ĐL không đạt được mức cam kết doanh số bán ra.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB152 — Chương trình đầu tư biển bảng, quầy kệ Shop in Shop`, text: `# TB152 — Chương trình đầu tư biển bảng, quầy kệ Shop in Shop
(Số 152/2025/TB-LVT, ngày 31/12/2025)

**Đối tượng áp dụng:** Đại Lý (ĐL) Livotec kênh GT.
**Thời gian áp dụng:** Từ ngày 01/01/2026 đến hết ngày 31/12/2026.
**Sản phẩm áp dụng:** Tất cả sản phẩm mang thương hiệu Livotec (trừ máy lọc nước) được Livotec ban hành trong các Chương trình khuyến mại kể từ ngày 01/01/2025.

## Điều kiện và quà tặng
**Điều kiện (đáp ứng đủ cả 3):**
- Doanh số nhập hàng tích lũy trong 02 tháng liên tiếp (VNĐ, +VAT) ≥ 100.000.000.
- Cam kết doanh số bán ra hàng tháng (VNĐ, +VAT) ≥ 80.000.000.
- Đáp ứng điều kiện về mặt bằng, vị trí theo tiêu chuẩn hãng.

**Quà tặng khi đáp ứng đủ điều kiện:** 01 Kệ vách gia dụng/Kệ vách đa năng/Kệ đảo gia dụng + Đầu tư PG.

## Chi tiết các hạng mục đầu tư hình ảnh
| STT | Hạng mục | Thông số kỹ thuật | Giá trị đầu tư (VND) |
|---|---|---|---|
| 1 | Kệ vách gia dụng/ Kệ vách đa năng | 1800x650x2400 mm | ~15.000.000 |
| 2 | Kệ đảo gia dụng VIP | 1900x900x1350 | ~15.000.000 |

## Quy định triển khai
- ĐL nhập hàng thể hiện bằng việc quét nhập trên App KShop thông qua QR code hoặc serial.
- Trường hợp ĐL đã được Livotec đầu tư hình ảnh kể từ ngày 01/01/2025, Livotec sẽ đánh giá thực tế và chỉ đầu tư các hạng mục hình ảnh phù hợp với không gian trưng bày của ĐL, không trùng lặp với hạng mục đã được đầu tư. Hạng mục hư hỏng/xuống cấp: tái đầu tư do Livotec xem xét và phê duyệt.
- ĐL cần kí biên bản cam kết và chỉ sử dụng quầy kệ được đầu tư để trưng bày các sản phẩm của Livotec trong tối thiểu 03 năm kể từ ngày lắp đặt.
- Đại lý chỉ được lựa chọn gói đầu tư hình ảnh tương ứng với 01 mức điều kiện đạt được, không được cộng dồn khi đồng thời thỏa mãn nhiều điều kiện.
- Thời gian trả thưởng: Livotec tổng kết hàng tháng và thực hiện trả thưởng trong vòng 45 ngày kể từ ngày cuối tháng mà ĐL đã nhập đủ số lượng máy theo gói đăng kí.
- Ưu đãi không được quy đổi thành tiền mặt hoặc sản phẩm khác.
- Hình thức trả thưởng: Livotec/Nhà thầu trực tiếp triển khai thi công tại ĐL.
- Livotec có quyền thu hồi các hạng mục đã đầu tư nếu ĐL không đạt được mức cam kết doanh số bán ra.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB153 — Chương trình Sắc màu thương hiệu Livotec (toàn quốc)`, text: `# TB153 — Chương trình Sắc màu thương hiệu Livotec (toàn quốc)
(Số 153/2025/TB-LVT, ngày 31/12/2025)

**Đối tượng áp dụng:** ĐL kênh GT toàn quốc.
**Thời gian áp dụng:** Từ 01/01/2026 đến hết ngày 31/12/2026.

## Đại lý nhập hàng và nhận gói đầu tư hình ảnh — 4 gói theo doanh số tích lũy tối thiểu trong 03 tháng liên tiếp
| Gói đăng ký | Doanh số tích lũy tối thiểu/3 tháng (VNĐ, +VAT) | Giá trị đầu tư hình ảnh lên tới (VNĐ, +VAT) | Ưu đãi (lựa chọn 1 trong 2) |
|---|---|---|---|
| Gói Bạc | 20.000.000 | 3.500.000 | Lựa chọn 1: 01 Ô lệch tâm — Lựa chọn 2: 01 Rối hơi |
| Gói Vàng | 60.000.000 | 20.000.000 | 01 Gói đầu tư quầy kệ |
| Gói Bạch Kim | 80.000.000 | 32.000.000 | Lựa chọn 1: 01 Gói đầu tư quầy kệ — Lựa chọn 2: 01 Gói đầu tư biển bảng |
| Gói Kim Cương | 120.000.000 | 50.000.000 | Lựa chọn 1: 01 Gói đầu tư quầy kệ — Lựa chọn 2: 01 Gói đầu tư biển bảng |

## Chi tiết các hạng mục đầu tư hình ảnh
| STT | Hạng mục | Thông số kỹ thuật | Giá trị đầu tư (VND, +VAT) |
|---|---|---|---|
| 1 | Ô lệch tâm | 2500x2500mm | ~3.500.000 |
| 2 | Rối hơi | Cao 1700mm | ~2.800.000 |
| 3 | Kệ vách đa năng ngành khí/ Kệ vách đa năng ngành gia dụng | 1800x650x2400 mm | ~15.000.000 |
| 4 | Kệ vách bếp từ | 1200x680x2700 mm | ~12.000.000 |
| 5 | Kệ đảo gia dụng VIP | 1900x900x1350 mm | ~15.000.000 |
| 6 | Biển Alu/cột hình ảnh | Theo kích thước thực tế cửa hàng | ~29.000.000 |

## Quy định chung
- Sản phẩm áp dụng: tất cả sản phẩm mang thương hiệu Livotec (trừ máy lọc nước) được Livotec ban hành trong các Chương trình khuyến mại kể từ ngày 01/01/2025.
- ĐL nhập hàng thể hiện bằng việc quét nhập trên App KShop thông qua QR code hoặc serial.
- Trường hợp ĐL đã được Livotec đầu tư hình ảnh kể từ ngày 01/01/2025, Livotec sẽ đánh giá thực tế và chỉ đầu tư các hạng mục hình ảnh phù hợp với không gian trưng bày của ĐL, không trùng lặp với hạng mục đã được đầu tư. Hạng mục hư hỏng/xuống cấp: tái đầu tư do Livotec xem xét và phê duyệt.
- ĐL cần kí biên bản cam kết và chỉ sử dụng quầy kệ được đầu tư để trưng bày các sản phẩm của Livotec trong tối thiểu 03 năm kể từ ngày lắp đặt.
- Đối với biển bảng: Livotec sẽ đánh giá và chi đầu tư khi cửa hàng nằm ở các vị trí ngã 3/ngã 4/mặt đường quốc lộ/mặt đường lớn có lưu lượng giao thông đông đúc.
- Đại lý chỉ được lựa chọn gói đầu tư hình ảnh tương ứng với 01 mức điều kiện đạt được, không được cộng dồn khi đồng thời thỏa mãn nhiều điều kiện.
- Thời gian trả thưởng: Livotec tổng kết hàng tháng và thực hiện trả thưởng trong vòng 45 ngày kể từ ngày cuối tháng mà ĐL đã nhập đủ số lượng máy theo gói đăng kí.
- Ưu đãi không được quy đổi thành tiền mặt hoặc sản phẩm khác.
- Hình thức trả thưởng: Livotec/Nhà thầu trực tiếp triển khai thi công tại ĐL.

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` },
  { title: `TB78 — Chương trình khuyến mại dành cho khách hàng tham gia hội nghị Online`, text: `# TB78 — Chương trình khuyến mại dành cho khách hàng tham gia hội nghị Online
(Số 78/2026/TB-LVT, ngày 01/08/2026)

**Thời gian áp dụng:** Từ ngày 01/08/2026 đến hết ngày 15/09/2026.
**Đối tượng áp dụng:** Các Đại Lý (ĐL) tham gia Hội nghị khách hàng Online tháng 8/2026.

## 1. Ưu đãi khi ĐL tham gia nhập hàng theo gói (lựa chọn 1 trong 2 gói)
| | Gói Kỉ Nguyên | Gói Bứt Phá |
|---|---|---|
| Lựa chọn 1 | 02 Nồi cơm điện tử LRC-E8118P | 01 Bếp từ đôi LID-980M (kèm nồi) |
| Lựa chọn 2 | 02 Bếp từ đơn LIS-660 | — |
| Tổng doanh thu nhập tích lũy tối thiểu (VNĐ, +VAT) | 30.000.000 | 85.000.000 |
| Số lượng Bình nước nóng nhập tối thiểu | 05 bình | 05 bình |

## 2. Ưu đãi khi ĐL nhập Bình nước nóng
- Ưu đãi: 01 Ô cầm tay Livotec, giá trị quà tặng 300.000đ.
- Quy định: Số lượng nhập tối thiểu 05 bình. Thời gian áp dụng: trong vòng 07 ngày kể từ ngày kết thúc Hội nghị khách hàng.

## Quy định chung
1. Sản phẩm áp dụng: Các sản phẩm mang thương hiệu Livotec (Trừ máy lọc nước, cây nóng lạnh và linh kiện).
2. Các quy định về doanh thu và số lượng nhập: Doanh thu và số lượng nhập được tính dựa trên số lượng sản phẩm ĐL quét nhập thành công trên ứng dụng KShop thông qua QR code hoặc mã Serial. Livotec sẽ xác thực lại mã Serial các máy được ĐL quét nhập trên KShop làm căn cứ trả thưởng.
3. Quy định khác:
   - Chương trình có thể kết thúc trước hạn, ưu tiên những đơn đặt và thanh toán trước.
   - Mỗi ĐL được hưởng tối đa 01 gói. ĐL được chọn gói nhận thưởng theo kết quả nhập hàng đạt được.
   - Thời gian trả thưởng: 20 ngày sau khi kết thúc thời gian quy định.
   - Hình thức trả thưởng: Trực tiếp tới ĐL/Thông qua NPP.

(Nguồn: Công ty TNHH Livotec)` },
  { title: `TB78a — Chương trình khuyến mại ưu đãi đặc biệt trực tiếp cho Bình nước nóng (dành cho NPP)`, text: `# TB78a — Chương trình khuyến mại ưu đãi đặc biệt trực tiếp cho Bình nước nóng (dành cho NPP)
(Số 78a/2026/TB-LVT, ngày 01/08/2026)

**Đối tượng áp dụng:** Nhà Phân Phối (NPP) kênh GT toàn quốc.
**Thời gian áp dụng:** Từ ngày 01/08/2026 đến hết ngày 31/10/2026.

## Nội dung chương trình
| Model | Giá NPP (dành cho NPP) | Giá nhập ưu đãi khi nhập ≥ 50 bình | Giá nhập ưu đãi khi nhập ≥ 100 bình |
|---|---|---|---|
| Bộ bình nóng trực tiếp Karofi KBO-I400 | 2.789.000 | 1.100.000 | 900.000 |

(Giá tính theo VNĐ, +VAT)

## Quy định khác
- Chương trình này không được áp dụng đồng thời với các chương trình khuyến mại/ưu đãi khác.
- Chương trình có thể kết thúc trước thời hạn, ưu tiên cho các đơn hàng đặt hàng và thanh toán trước.
- NPP tham gia Chương trình khuyến mại này sẽ được hưởng khuyến mại theo số lượng NPP đặt hàng (SI) trong thời gian chương trình khuyến mại.
- Tiến độ thanh toán tổng giá trị đơn hàng dành cho NPP theo chính sách đã ban hành.
- Quy định áp dụng khuyến mại này với các chính sách đã ban hành: Chiết khấu thanh toán: Không. Thưởng hoàn thành mục tiêu Tháng/Quý/Năm: Không (nhưng được ghi nhận làm điều kiện tính thưởng hoàn thành mục tiêu tháng, quý, năm).

(Nguồn: Công ty TNHH Livotec, TP. Vận hành kinh doanh Cao Tiến Hải)` }
];

// Bỏ dấu tiếng Việt để so khớp từ khoá không phân biệt có dấu/không dấu.
function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function tokenize(s) {
  return stripDiacritics(String(s || "").toLowerCase()).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
}
const STOP = new Set(["la","co","cua","cho","voi","mot","nhu","nao","the","nay","khi","nhung","neu","duoc","hay","gi","sao","bao","nhieu","toi","ban","minh","day","kia","mn"]);

// Chọn các mục liên quan nhất tới câu hỏi (theo số từ khoá trùng), ghép lại không vượt quá maxChars.
// Luôn kèm mục "Bảng giá sản phẩm" vì hầu hết câu hỏi đều có thể liên quan tới giá/model.
function pickRelevant(question, maxChars, sections) {
  maxChars = maxChars || 14000;
  const KAI_SECTIONS = sections && sections.length ? sections : STATIC_SECTIONS;
  const qTokens = tokenize(question).filter((w) => !STOP.has(w));
  // Khớp theo TỪ nguyên (không khớp chuỗi con như "tra" trong "tra cứu"), từ trùng trong tiêu đề được tính gấp đôi.
  const scored = KAI_SECTIONS.map((sec) => {
    const body = new Set(tokenize(sec.text)), head = new Set(tokenize(sec.title));
    let score = 0;
    qTokens.forEach((t) => { if (head.has(t)) score += 2; else if (body.has(t)) score++; });
    return { sec, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = [], seen = new Set();
  let total = 0;
  const priceSec = KAI_SECTIONS.find((s) => /bang gia/i.test(stripDiacritics(s.title)));
  const ordered = [];
  scored.forEach((x) => { if (x.score > 0) ordered.push(x.sec); });
  if (priceSec && ordered.indexOf(priceSec) < 0) ordered.push(priceSec);
  // Nếu không mục nào khớp từ khoá, vẫn gửi vài mục đầu để mô hình còn ngữ cảnh chung mà trả lời "chưa có thông tin".
  if (!ordered.length) KAI_SECTIONS.slice(0, 3).forEach((s) => ordered.push(s));
  for (const sec of ordered) {
    if (seen.has(sec.title)) continue;
    if (total + sec.text.length > maxChars && picked.length) break;
    picked.push(sec.text); seen.add(sec.title); total += sec.text.length;
    if (total >= maxChars) break;
  }
  return picked.join("\n\n---\n\n");
}


// ---------- Tài liệu do quản trị viên thêm trên trang quản trị (lưu trong Blob, không cần sửa code) ----------
const store = require("./store");
const DOCS_KEY = "kai/docs.json";
const SETTINGS_KEY = "kai/settings.json";
const CHUNK = 3000; // ký tự mỗi mục khi cắt tài liệu dài, để chỉ gửi phần liên quan tới câu hỏi

// Cắt văn bản dài theo tiêu đề (# ...) rồi theo đoạn, mỗi mục tối đa ~CHUNK ký tự.
function chunkText(title, text) {
  const paras = String(text || "").replace(/\r/g, "").split(/\n{2,}/);
  const out = []; let cur = "";
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  paras.forEach((p) => {
    if (/^#{1,3}\s/.test(p.trim()) && cur.length > CHUNK * 0.4) flush();
    if (p.length > CHUNK) { // đoạn quá dài: cắt theo dòng
      flush();
      p.split("\n").forEach((line) => { if (cur.length + line.length + 1 > CHUNK) flush(); cur += line + "\n"; });
      return;
    }
    if (cur.length + p.length + 2 > CHUNK) flush();
    cur += p + "\n\n";
  });
  flush();
  const n = out.length;
  return out.map((t, i) => {
    const ti = n > 1 ? title + " (phần " + (i + 1) + "/" + n + ")" : title;
    return { title: ti, text: "# " + ti + "\n" + t };
  });
}
function docToSections(d) { return d && d.enabled !== false ? chunkText(d.title, d.text) : []; }

let cache = { at: 0, sections: null };
async function getDocs() { return (await store.get(DOCS_KEY)) || []; }
async function saveDocs(list) { await store.put(DOCS_KEY, list); cache = { at: 0, sections: null }; }
async function getSections() {
  if (cache.sections && Date.now() - cache.at < 30000) return cache.sections;
  let extra = [];
  try { (await getDocs()).forEach((d) => { extra = extra.concat(docToSections(d)); }); } catch (e) { /* lỗi đọc: dùng tài liệu có sẵn */ }
  cache = { at: Date.now(), sections: STATIC_SECTIONS.concat(extra) };
  return cache.sections;
}

const DEFAULT_SETTINGS = { defaultLimit: 30, anonLimit: 3, paused: false, pausedMsg: "", blocked: {}, limits: {} };
async function getSettings() {
  const s = (await store.get(SETTINGS_KEY)) || {};
  const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  return {
    defaultLimit: num(s.defaultLimit, DEFAULT_SETTINGS.defaultLimit, 1, 500),
    anonLimit: num(s.anonLimit, DEFAULT_SETTINGS.anonLimit, 0, 50),
    paused: !!s.paused, pausedMsg: String(s.pausedMsg || "").slice(0, 300),
    blocked: s.blocked && typeof s.blocked === "object" ? s.blocked : {},
    limits: s.limits && typeof s.limits === "object" ? s.limits : {}
  };
}
async function saveSettings(s) { await store.put(SETTINGS_KEY, s); }

module.exports = { KAI_SECTIONS: STATIC_SECTIONS, STATIC_SECTIONS, pickRelevant, chunkText, getDocs, saveDocs, getSections, getSettings, saveSettings };
