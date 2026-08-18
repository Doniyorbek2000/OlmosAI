# Benchmarks

A fixed benchmark set makes provider comparisons and router decisions objective
(spec §88). Use the **same** inputs across providers.

## Dataset structure

```
benchmarks/
  inputs/            # canonical images / prompts (versioned)
  expected/          # reference notes (not pixel-exact)
  runs/<provider>/<version>/results.json
```

## Metrics per run

- generation time (s)
- mesh quality score (AssetQualityService)
- input/prompt alignment (rated)
- polygon quality, texture quality
- failure rate over N runs
- peak VRAM (MB)

## Usage

Store results as `runs/<provider>/<version>/results.json`. The router may consume
recent benchmark scores as an additional signal alongside live health and load.
