# Sentinel model card

## Purpose and scope

An educational supervised classifier for a local transaction-monitoring project. It demonstrates feature engineering, neural-network inference, threshold selection, SQL persistence, and analyst review. It is not a model validated for lending, payment blocking, or any real financial decision.

## Data

`src/features.js` generates synthetic normalized feature vectors and labels. A latent synthetic suspicious class changes the distribution of amounts, countries, devices, transaction velocities, and account ages. Labels are randomly flipped with probability 0.035. Class generation probability is 0.23. There are no customers, payment credentials, or real bank records in this dataset.

| Split | Count | Generator seed | Use |
| --- | ---: | ---: | --- |
| Train | 3,200 | 101 | Weight optimization |
| Validation | 800 | 202 | Select high-risk threshold by maximum F1 |
| Test | 1,000 | 303 | Report final performance at the selected threshold |

Feature transforms have fixed bounds; no scaler is fitted to the holdout sets. Independent random seeds separate generated records. This synthetic split does not establish temporal generalization, account-level generalization, or real population representativeness.

## Features, in order

| Feature | Transform |
| --- | --- |
| `log_amount` | `log1p(amountMinor) / log1p(100000000)`, clipped to [0, 1] |
| `amount_to_average` | `amountMinor / averageAmountMinor / 10`, clipped |
| `foreign_country` | 1 when country differs from the profile's home country |
| `new_device` | 1 when device is absent from the known-device list |
| `hourly_velocity` | Prior-hour transaction count / 20, clipped |
| `night_transaction` | 1 between 00:00 inclusive and 05:00 exclusive in IST |
| `young_account` | `1 - clip(accountAgeDays / 180)` |
| `bank_transfer` | 1 for bank-transfer channel, otherwise 0 |

At inference time, the API obtains profile data from SQL and computes recent velocity from committed history. Transaction timestamps are server receipt times. Profiles are reference inputs and are not automatically updated by this model.

## Training and versioning

TensorFlow.js CPU backend; dense layers 16 ReLU, 8 ReLU, and 1 sigmoid; Adam learning rate 0.006; binary cross entropy; 24 epochs; batch size 64; no training shuffle; explicit initialization seeds. Exact numerical reproducibility can depend on framework and platform versions.

Threshold candidates run from 0.10 through 0.90 in steps of 0.05. Select maximum validation F1, breaking ties in favor of the first lower threshold. The included artifact selected **0.30**. Medium risk starts at 0.165; high risk starts at 0.30. These thresholds are for this demonstration, not production policy recommendations.

`models/model.json` includes weights, feature schema version, feature names, threshold, and report. Its version uses a SHA-256 digest prefix of serialized weights. Transactions retain the version used at scoring time. The worker checks feature compatibility when loading. The architecture lives in code; changing it requires retraining. `models/report.json` mirrors the report for easier review.

## Included artifact results

The synthetic test set contains 248 positive and 752 negative labels. At threshold 0.30: TP=224, FP=19, TN=733, FN=24. Precision is 92.18%, recall 90.32%, F1 91.24%, and accuracy 95.70%. Validation F1 is 93.24%. These values come from an executed training run, not estimates or real financial evaluations.

Accuracy alone is insufficient for imbalanced fraud tasks; the UI emphasizes precision, recall, and F1 and shows confusion counts. Metrics should not be generalized beyond this generated dataset.

## Limits and future work

The generator encodes the patterns that the network learns, so synthetic performance can be optimistic. There is no real-data benchmark, probability calibration, fairness assessment, drift monitor, real-time feature store, or human-label retraining loop. Country/device mismatch and nighttime behavior are contextual signals and do not establish wrongdoing. Rule-based indicators displayed alongside predictions are not model explanations or causal attributions.

A real-data extension needs lawful labeled historical data, features constructed only from information available before each event, temporal and account-aware splits, rare-positive evaluation, calibration, and monitored operating thresholds. No such extension is claimed by this project.
