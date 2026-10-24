# Landmark fixtures

Each `<sign>.npz` holds `frames`: a `(T, 543, 3)` float16 MediaPipe Holistic
landmark sequence of one genuine performance of that sign, extracted with
`scripts/extract_landmarks.py` from a PopSign ASL v1.0 test-split video.

| file | source video |
| --- | --- |
| hello.npz | gtsignstudy4a.8031-hello-… |
| thankyou.npz | gtsignstudy4a.8032-thankyou-… |
| please.npz | gtsignstudy4a.8036-please-… |
| yes.npz | gtsignstudy4a.8037-yes-… |
| mom.npz | gtsignstudy4a.8036-mom-… |
| water.npz | gtsignstudy4a.8037-water-… |

Derived from PopSign ASL v1.0 (Thad Starner et al., Georgia Institute of
Technology and Deaf Professional Arts Network), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: video
reduced to MediaPipe landmarks, stored at half precision.
