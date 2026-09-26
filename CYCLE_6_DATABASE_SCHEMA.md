# Cycle 6 - Schema de Banco de Dados

**Versão**: 1.0 | **Data**: Setembro 2026 | **Target**: PostgreSQL 14+

---

## 📋 Visão Geral

**Novas Tabelas**: 9  
**Materialized Views**: 3  
**Migrations**: 6 arquivos  
**Data Retention**: 24 meses (analytics), 12 meses (scores), 6 meses (forecasts)

---

## 📊 Tabelas de Analytics

### 1. analytics_pipeline_metric

Snapshots diários de metrics de pipeline por stage.

```sql
CREATE TABLE analytics_pipeline_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL,
    metric_date DATE NOT NULL,

    -- Metrics
    count_opportunities INTEGER NOT NULL,
    count_closed_won INTEGER NOT NULL,
    count_closed_lost INTEGER NOT NULL,
    avg_days_in_stage FLOAT NOT NULL,
    avg_deal_size NUMERIC(15,2) NOT NULL,
    total_pipeline_value NUMERIC(15,2) NOT NULL,
    win_rate FLOAT NOT NULL, -- (closed_won / (closed_won + closed_lost))

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_pipeline_metric UNIQUE (org_id, pipeline_id, stage_id, metric_date),
    CONSTRAINT valid_win_rate CHECK (win_rate >= 0 AND win_rate <= 1),
    CONSTRAINT valid_count CHECK (count_opportunities >= 0)
);

CREATE INDEX idx_analytics_pipeline_metric_org_date
    ON analytics_pipeline_metric(org_id, metric_date DESC);
CREATE INDEX idx_analytics_pipeline_metric_pipeline_date
    ON analytics_pipeline_metric(pipeline_id, metric_date DESC);
```

### 2. analytics_rep_metric

Agregações semanais de desempenho por representante.

```sql
CREATE TABLE analytics_rep_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_week DATE NOT NULL, -- Monday of the week

    -- Performance Metrics
    pipeline_value NUMERIC(15,2) NOT NULL,
    closed_value NUMERIC(15,2) NOT NULL,
    avg_deal_size NUMERIC(15,2) NOT NULL,
    deals_closed_count INTEGER NOT NULL,
    deals_lost_count INTEGER NOT NULL,
    win_rate FLOAT NOT NULL,
    avg_cycle_days INTEGER NOT NULL,

    -- Ranking
    percentile_rank FLOAT, -- 0-100, percentile among reps in org
    rank_in_org INTEGER, -- 1, 2, 3, ...

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_rep_metric UNIQUE (org_id, user_id, metric_week),
    CONSTRAINT valid_win_rate CHECK (win_rate >= 0 AND win_rate <= 1)
);

CREATE INDEX idx_analytics_rep_metric_org_week
    ON analytics_rep_metric(org_id, metric_week DESC);
CREATE INDEX idx_analytics_rep_metric_user_week
    ON analytics_rep_metric(user_id, metric_week DESC);
```

---

## 🤖 Tabelas de Scoring

### 3. opportunity_score

Scores ML de oportunidades (revisão diária).

```sql
CREATE TABLE opportunity_score (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,

    -- Score & Confidence
    score INTEGER NOT NULL, -- 0-100
    confidence INTEGER NOT NULL, -- 0-100

    -- Top 3 Factors
    factors JSONB NOT NULL, -- {"Email Engagement": 28, "Meeting Freq": 19, "Account Growth": 15}

    -- Model Version
    model_version VARCHAR(20) NOT NULL, -- v2.3

    -- Timestamps
    computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_score CHECK (score >= 0 AND score <= 100),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 100),
    CONSTRAINT score_has_factors CHECK (jsonb_array_length(factors) > 0)
);

CREATE INDEX idx_opportunity_score_org_computed
    ON opportunity_score(org_id, computed_at DESC);
CREATE INDEX idx_opportunity_score_opportunity
    ON opportunity_score(opportunity_id);
CREATE UNIQUE INDEX idx_opportunity_latest_score
    ON opportunity_score(opportunity_id, computed_at DESC);
```

### 4. scoring_model

Histórico e metadata de modelos de ML.

```sql
CREATE TABLE scoring_model (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Version Info
    version VARCHAR(20) NOT NULL UNIQUE, -- v2.3
    model_path VARCHAR(255) NOT NULL, -- s3://bucket/models/v2.3/model.pkl

    -- Training Info
    trained_at TIMESTAMP NOT NULL,
    training_duration_seconds INTEGER,
    training_sample_size INTEGER,

    -- Metrics
    metrics JSONB NOT NULL, -- {auc: 0.87, precision: 0.84, recall: 0.81, f1_score: 0.83}

    -- Features
    feature_importance JSONB NOT NULL, -- {"feature_name": importance_score, ...}
    feature_count INTEGER NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    next_training_scheduled TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_metrics CHECK (metrics->>'auc' IS NOT NULL)
);

CREATE INDEX idx_scoring_model_org_version
    ON scoring_model(org_id, version);
CREATE INDEX idx_scoring_model_active
    ON scoring_model(org_id, is_active);
```

### 5. scoring_model_metrics

Histórico de métricas de modelo para tracking de drift.

```sql
CREATE TABLE scoring_model_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES scoring_model(id) ON DELETE CASCADE,

    -- Metric Details
    metric_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- auc, precision, recall, f1_score
    value FLOAT NOT NULL,
    sample_size INTEGER,

    -- Context
    percentile_rank FLOAT, -- vs. other models trained in same org

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_model_metric UNIQUE (model_id, metric_date, metric_type),
    CONSTRAINT valid_value CHECK (value >= 0 AND value <= 1)
);

CREATE INDEX idx_scoring_model_metrics_date
    ON scoring_model_metrics(model_id, metric_date DESC);
```

---

## 📈 Tabelas de Forecasting

### 6. forecast_baseline

Previsões diárias por pipeline e cenário.

```sql
CREATE TABLE forecast_baseline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,

    -- Forecast Details
    forecast_date DATE NOT NULL,
    scenario_type VARCHAR(20) NOT NULL, -- likely, upside, conservative

    -- Values (13-week breakdown)
    values JSONB NOT NULL, -- {week_1: 150000, week_2: 210000, ..., week_13: 3500000}

    -- Statistics
    total_value NUMERIC(15,2) GENERATED ALWAYS AS (
        (values->>'week_1')::numeric + (values->>'week_2')::numeric + ...
    ) STORED,
    margin_of_error_pct FLOAT NOT NULL, -- confidence interval
    vs_quota_pct FLOAT NOT NULL, -- achievement % vs. quota

    -- Assumptions
    assumptions JSONB, -- {conversion_rate: 0.62, cycle_days: 28, closes_per_week: 12}

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_forecast UNIQUE (org_id, pipeline_id, forecast_date, scenario_type),
    CONSTRAINT valid_values CHECK (jsonb_array_length(values) = 13)
);

CREATE INDEX idx_forecast_baseline_org_date
    ON forecast_baseline(org_id, forecast_date DESC);
CREATE INDEX idx_forecast_baseline_pipeline_date
    ON forecast_baseline(pipeline_id, forecast_date DESC);
```

### 7. forecast_scenario

Cenários customizados criados por usuários.

```sql
CREATE TABLE forecast_scenario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,

    -- Scenario Info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Input Adjustments
    adjustments JSONB NOT NULL, -- {conversion_rate: 0.70, cycle_days: 24, closes_per_week: 15}

    -- Forecast Results
    forecast_values JSONB NOT NULL, -- {week_1: ..., week_2: ..., ...}
    total_forecast NUMERIC(15,2) NOT NULL,
    delta_vs_baseline NUMERIC(15,2),
    delta_pct FLOAT,

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP NOT NULL, -- default: 30 days

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_forecast_scenario_org_pipeline
    ON forecast_scenario(org_id, pipeline_id);
CREATE INDEX idx_forecast_scenario_expires
    ON forecast_scenario(expires_at) WHERE expires_at > CURRENT_TIMESTAMP;
```

---

## ⚠️ Tabelas de Alertas

### 8. pipeline_health_alert

Alertas de saúde de pipeline (lifecycle completo).

```sql
CREATE TABLE pipeline_health_alert (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Alert Classification
    alert_type VARCHAR(50) NOT NULL, -- stage_imbalance, velocity_slowdown, stalled_deal, activity_gap, score_discrepancy
    severity VARCHAR(20) NOT NULL, -- critical, warning, info

    -- Alert Message
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Context
    pipeline_id UUID,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    stage_id UUID,
    user_id UUID,

    -- Alert Data
    data JSONB, -- {stage: "proposal", percentage: 65, average: 32, ...}

    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dismissed_at TIMESTAMP,
    snooze_until TIMESTAMP,
    resolved_at TIMESTAMP,
    dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dismiss_reason VARCHAR(255),

    CONSTRAINT alert_terminal_states CHECK (
        (dismissed_at IS NULL OR resolved_at IS NULL)
    )
);

CREATE INDEX idx_pipeline_health_alert_org_created
    ON pipeline_health_alert(org_id, created_at DESC);
CREATE INDEX idx_pipeline_health_alert_active
    ON pipeline_health_alert(org_id) WHERE resolved_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX idx_pipeline_health_alert_severity
    ON pipeline_health_alert(severity);
```

### 9. alert_rule

Configuração de regras de alerta por org.

```sql
CREATE TABLE alert_rule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Rule Configuration
    rule_type VARCHAR(50) NOT NULL, -- stage_imbalance, velocity_slowdown, etc

    -- Thresholds
    threshold_value FLOAT NOT NULL,
    severity VARCHAR(20) NOT NULL, -- critical, warning, info
    check_frequency VARCHAR(50) NOT NULL, -- hourly, 4_hours, daily

    -- Control
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID NOT NULL REFERENCES users(id),

    CONSTRAINT unique_rule UNIQUE (org_id, rule_type),
    CONSTRAINT valid_threshold CHECK (threshold_value > 0)
);

CREATE INDEX idx_alert_rule_org_enabled
    ON alert_rule(org_id, enabled);
```

### 10. analytics_report

Relatórios gerados e distribuídos automaticamente.

```sql
CREATE TABLE analytics_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Report Details
    report_type VARCHAR(50) NOT NULL, -- weekly_pipeline, rep_performance, health_summary
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,

    -- Content
    data JSONB NOT NULL, -- full report content/summary

    -- Distribution
    file_path VARCHAR(255), -- s3://bucket/reports/report_id.pdf
    file_format VARCHAR(20), -- pdf, excel
    recipients JSONB, -- {emails: [...], user_ids: [...]}
    sent_at TIMESTAMP,

    -- Scheduling
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_period CHECK (report_period_start <= report_period_end)
);

CREATE INDEX idx_analytics_report_org_period
    ON analytics_report(org_id, report_period_start DESC);
```

---

## 🔄 Materialized Views

### mv_pipeline_velocity

Snapshot horário de velocity de pipeline (stage distribution + aging).

```sql
CREATE MATERIALIZED VIEW mv_pipeline_velocity AS
SELECT
    org_id,
    pipeline_id,
    DATE_TRUNC('hour', CURRENT_TIMESTAMP)::timestamp as snapshot_time,

    -- Stage Distribution
    jsonb_object_agg(
        s.name,
        COUNT(*) FILTER (WHERE o.stage_id = s.id)
    ) as stage_counts,

    -- Metrics
    COUNT(*) as total_opportunities,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at)) / 86400
    ) as median_days_in_pipeline,
    SUM(o.amount) as total_pipeline_value,
    COUNT(*) FILTER (WHERE o.closed_won_at IS NOT NULL) as closed_won_count

FROM opportunities o
LEFT JOIN pipeline_stages s ON o.stage_id = s.id
WHERE o.deleted_at IS NULL
GROUP BY org_id, pipeline_id;

CREATE UNIQUE INDEX idx_mv_pipeline_velocity
    ON mv_pipeline_velocity(org_id, pipeline_id, snapshot_time DESC);
```

**Refresh**: Hourly (job agendado via APScheduler)

### mv_win_loss_by_stage

Análise de conversão por stage (daily refresh).

```sql
CREATE MATERIALIZED VIEW mv_win_loss_by_stage AS
SELECT
    org_id,
    pipeline_id,
    stage_id,
    DATE(closed_won_at) as close_date,

    -- Win/Loss Counts
    COUNT(*) FILTER (WHERE closed_won_at IS NOT NULL) as win_count,
    COUNT(*) FILTER (WHERE closed_lost_at IS NOT NULL) as loss_count,
    COUNT(*) as total_opportunities,

    -- Win Rate
    CASE
        WHEN COUNT(*) > 0 THEN
            COUNT(*) FILTER (WHERE closed_won_at IS NOT NULL)::float / COUNT(*)
        ELSE 0
    END as win_rate,

    -- Avg Cycle
    AVG(EXTRACT(EPOCH FROM (
        COALESCE(closed_won_at, closed_lost_at, CURRENT_TIMESTAMP) - created_at
    )) / 86400) as avg_cycle_days

FROM opportunities
WHERE deleted_at IS NULL
GROUP BY org_id, pipeline_id, stage_id, close_date;

CREATE UNIQUE INDEX idx_mv_win_loss_by_stage
    ON mv_win_loss_by_stage(org_id, pipeline_id, stage_id, close_date DESC);
```

**Refresh**: Daily 05:00 UTC

### mv_rep_performance

Agregação semanal de desempenho individual (weekly refresh).

```sql
CREATE MATERIALIZED VIEW mv_rep_performance AS
SELECT
    org_id,
    owner_id as user_id,
    DATE_TRUNC('week', closed_won_at)::date as week_start,

    -- Metrics
    COUNT(*) FILTER (WHERE closed_won_at IS NOT NULL) as deals_closed,
    COUNT(*) FILTER (WHERE closed_lost_at IS NOT NULL) as deals_lost,
    SUM(amount) FILTER (WHERE closed_won_at IS NOT NULL)::numeric(15,2) as total_value,
    AVG(amount) FILTER (WHERE closed_won_at IS NOT NULL)::numeric(15,2) as avg_deal_size,

    -- Rate
    CASE
        WHEN COUNT(*) > 0 THEN
            COUNT(*) FILTER (WHERE closed_won_at IS NOT NULL)::float / COUNT(*)
        ELSE 0
    END as win_rate,

    -- Ranking
    PERCENT_RANK() OVER (
        PARTITION BY org_id, DATE_TRUNC('week', closed_won_at)
        ORDER BY SUM(amount) FILTER (WHERE closed_won_at IS NOT NULL)
    ) * 100 as percentile_rank

FROM opportunities
WHERE deleted_at IS NULL AND closed_won_at IS NOT NULL
GROUP BY org_id, owner_id, week_start;

CREATE UNIQUE INDEX idx_mv_rep_performance
    ON mv_rep_performance(org_id, user_id, week_start DESC);
```

**Refresh**: Weekly Sunday 02:00 UTC

---

## 🔄 Migrations

### migration_001_create_analytics_tables.sql

```sql
-- Create analytics_pipeline_metric
CREATE TABLE analytics_pipeline_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    pipeline_id UUID NOT NULL,
    stage_id UUID NOT NULL,
    metric_date DATE NOT NULL,
    count_opportunities INTEGER NOT NULL,
    count_closed_won INTEGER NOT NULL,
    count_closed_lost INTEGER NOT NULL,
    avg_days_in_stage FLOAT NOT NULL,
    avg_deal_size NUMERIC(15,2) NOT NULL,
    total_pipeline_value NUMERIC(15,2) NOT NULL,
    win_rate FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pipeline_metric UNIQUE (org_id, pipeline_id, stage_id, metric_date),
    CONSTRAINT valid_win_rate CHECK (win_rate >= 0 AND win_rate <= 1)
);
CREATE INDEX idx_analytics_pipeline_metric_org_date ON analytics_pipeline_metric(org_id, metric_date DESC);

-- Create analytics_rep_metric
CREATE TABLE analytics_rep_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    user_id UUID NOT NULL,
    metric_week DATE NOT NULL,
    pipeline_value NUMERIC(15,2) NOT NULL,
    closed_value NUMERIC(15,2) NOT NULL,
    avg_deal_size NUMERIC(15,2) NOT NULL,
    deals_closed_count INTEGER NOT NULL,
    deals_lost_count INTEGER NOT NULL,
    win_rate FLOAT NOT NULL,
    avg_cycle_days INTEGER NOT NULL,
    percentile_rank FLOAT,
    rank_in_org INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_rep_metric UNIQUE (org_id, user_id, metric_week)
);
CREATE INDEX idx_analytics_rep_metric_org_week ON analytics_rep_metric(org_id, metric_week DESC);

-- Rollback: DROP TABLE analytics_rep_metric; DROP TABLE analytics_pipeline_metric;
```

### migration_002_create_scoring_tables.sql

### migration_003_create_forecast_tables.sql

### migration_004_create_alert_tables.sql

### migration_005_create_report_table.sql

### migration_006_create_materialized_views.sql

_(Padrão similar para cada grupo de tabelas)_

---

## 📌 Data Retention Policy

```
Table                    | Retention | Archival Strategy
-------------------------|-----------|------------------
analytics_pipeline_metric| 24 meses  | Archive to S3 mensalmente
analytics_rep_metric     | 24 meses  | Archive to S3 mensalmente
opportunity_score        | 12 meses  | Delete old versions, keep latest
scoring_model            | Indefinido| Histórico de todas as versões
forecast_baseline        | 6 meses   | Delete após 6 meses
forecast_scenario        | 30 dias   | Auto-delete via expires_at
pipeline_health_alert    | 90 dias   | Delete resolved alerts após 90 dias
alert_rule               | Indefinido| Configuration permanente
analytics_report         | 12 meses  | Archive PDFs to S3 após 3 meses
```

---

## 🔐 Constraints & Validations

### Org Isolation

- Todas as tabelas têm org_id
- Foreign keys referenciam opportunities/users via org_id implicitamente
- Trigger para validar org_id match em inserts

### Temporal Consistency

- Forecast dates sempre >= CURRENT_DATE
- Alert created_at <= dismissed_at/resolved_at
- Model trained_at <= next_training_scheduled

### Data Integrity

- Scores 0-100, confidence 0-100, win_rate 0-1
- Deal values sempre > 0
- Cycle days sempre >= 1

---

## 📊 Query Performance Targets

| Query                          | Target | Achievable                   |
| ------------------------------ | ------ | ---------------------------- |
| Load velocity metrics          | <100ms | ✅ (cached, indexed)         |
| Fetch opportunity scores (100) | <200ms | ✅ (indexed, pagination)     |
| Generate forecast              | <1s    | ✅ (Monte Carlo optimized)   |
| List active alerts             | <100ms | ✅ (partial index on active) |
| Rep ranking query              | <200ms | ✅ (materialized view)       |
| Backtest forecast              | <5s    | ✅ (batch query)             |

---

## 🔄 Sync & Consistency

### Idempotent Operations

- Scoring: Se opportunity_score já existe para (opp_id, date), UPDATE ao invés de INSERT
- Alerts: Deduplication windows (2-4h) para evitar duplicatas

### Eventual Consistency

- Materialized views não são transacionais (refreshes periódicas)
- Cache TTLs permitem lag de até 1h em analytics
- Dashboard é eventual-consistent friendly

---

## 🚀 Deployment Checklist

- [ ] Criar migrações em order (001-006)
- [ ] Teste: Migrate up + verify structure
- [ ] Teste: Migrate down + verify rollback
- [ ] Performance: Run explain plan em queries críticas
- [ ] Backup: Full dump antes de apply em produção
- [ ] Validation: Seed dados sample, verifica constraints
- [ ] Documentation: Atualizar runbooks com nova schema
