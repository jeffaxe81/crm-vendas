# Cycle 6 - Arquitetura Técnica Detalhada

**Versão**: 1.0 | **Data**: Setembro 2026 | **Status**: Ready for Development

---

## 📐 Arquitetura de Sistema

### Componentes Principais

```
Frontend (React + Recharts)
├── AnalyticsRouter
│   ├── PipelineVelocityView (Main Dashboard)
│   ├── ScoringView
│   ├── ForecastingDashboard
│   ├── HealthAlertsView
│   ├── ComparativeAnalyticsView
│   └── AdminConfigView
├── StateManagement (Zustand)
│   ├── analyticsStore
│   ├── scoringStore
│   ├── forecastStore
│   └── alertsStore
└── Common Components
    ├── MetricCard, TrendIndicator
    ├── BarChart, LineChart, HistogramChart
    ├── AlertNotificationBell
    └── ScenarioBuilder

Backend (FastAPI)
├── API Routes
│   ├── /api/v1/analytics/* (5 endpoints)
│   ├── /api/v1/scoring/* (4 endpoints)
│   ├── /api/v1/forecast/* (5 endpoints)
│   ├── /api/v1/alerts/* (3 endpoints)
│   └── /api/v1/admin/* (3 endpoints)
├── Services
│   ├── AnalyticsService
│   ├── ScoringService
│   ├── ForecastingService
│   ├── HealthMonitorService
│   └── ComparativeAnalyticsService
├── Background Jobs (APScheduler)
│   ├── forecast_generation_job (daily 02:00 UTC)
│   ├── model_training_job (daily 03:00 UTC)
│   ├── alert_evaluation_job (daily 04:00 UTC)
│   ├── velocity_mv_refresh_job (hourly)
│   └── rep_metrics_aggregation_job (weekly)
└── Data Access Layer
    ├── Repository pattern
    ├── Query optimization
    └── Caching layer (Redis)

Database (PostgreSQL)
├── Core Tables (from Cycle 4-5)
│   ├── opportunities
│   ├── activities
│   ├── pipeline_templates
│   └── emails
├── Analytics Tables
│   ├── analytics_pipeline_metric
│   ├── analytics_rep_metric
│   ├── opportunity_score
│   ├── scoring_model
│   ├── scoring_model_metrics
│   ├── forecast_baseline
│   ├── forecast_scenario
│   ├── pipeline_health_alert
│   ├── alert_rule
│   └── analytics_report
└── Materialized Views
    ├── mv_pipeline_velocity
    ├── mv_win_loss_by_stage
    └── mv_rep_performance

Cache Layer (Redis)
├── velocity_metrics (TTL: 1h)
├── scoring_model (TTL: 24h)
├── forecast_results (TTL: 4h)
└── alert_rules (TTL: 30min)
```

---

## 🎨 Frontend Architecture

### State Management (Zustand)

```typescript
// analyticsStore
interface AnalyticsState {
  velocityData: PipelineVelocity;
  dateRange: [Date, Date];
  selectedPipeline: string;
  metrics: {
    totalOpps: number;
    avgDays: number;
    pipelineValue: number;
    winRate: number;
  };
  loading: boolean;
  error: string | null;
  actions: {
    fetchVelocity(pipelineId): Promise<void>;
    setDateRange(range): void;
    selectPipeline(id): void;
  };
}

// scoringStore
interface ScoringState {
  scores: Opportunity[]; // com score data
  filteredScores: Opportunity[];
  sortBy: "score" | "confidence" | "name";
  filters: {
    pipeline: string;
    scoreRange: [number, number];
    confidence: number;
  };
  distribution: Map<string, number>; // score bucket -> count
  topFactors: Map<string, number>; // factor name -> importance %
  actions: {
    fetchScores(): Promise<void>;
    updateFilters(filters): void;
    exportScores(format): Promise<Blob>;
  };
}

// forecastStore
interface ForecastState {
  forecast: {
    likely: number; // P50
    upside: number; // P90
    conservative: number; // P10
    weeklyBreakdown: number[];
    confidence: number;
  };
  scenarios: CustomScenario[];
  selectedScenario: CustomScenario | null;
  scenarioInputs: {
    conversionRate: number;
    cycleDays: number;
    closesPerWeek: number;
  };
  actions: {
    fetchForecast(): Promise<void>;
    buildScenario(inputs): Promise<void>;
    saveScenario(scenario): Promise<void>;
    deleteScenario(id): Promise<void>;
  };
}

// alertsStore
interface AlertsState {
  alerts: Alert[];
  activeCount: number; // críticos
  warningCount: number; // avisos
  filters: {
    type: AlertType;
    severity: "critical" | "warning" | "info";
    resolved: boolean;
  };
  history: Alert[];
  actions: {
    fetchAlerts(): Promise<void>;
    snoozeAlert(id, duration): Promise<void>;
    dismissAlert(id, reason): Promise<void>;
    resolveAlert(id): Promise<void>;
    fetchHistory(days): Promise<void>;
  };
}
```

### Component Hierarchy

#### PipelineVelocityView

```
PipelineVelocityView (page)
├── Header (title, date range, pipeline selector, export)
├── MetricsGrid
│   ├── MetricCard (Total Opportunities)
│   ├── MetricCard (Avg Days in Pipeline)
│   ├── MetricCard (Pipeline Value)
│   └── MetricCard (Win Rate)
├── StageProgressionChart (Recharts BarChart)
├── DealAgingTable (virtualized list)
└── WinRateVisualization (horizontal progress bars)
```

#### ScoringView

```
ScoringView (page)
├── Header + Controls
├── FilterGroup (pipeline, sort)
├── ScoreGrid (3-column responsive)
│   └── ScoreCard (company, score, confidence, top 3 factors)
├── ScoreDistributionChart (histogram)
└── OpportunitiesTable (sortable, filterable)
```

#### ForecastingDashboard

```
ForecastingDashboard (page)
├── Header + Controls (save, new scenario)
├── MetricsGrid
│   ├── MetricCard (Likely Forecast)
│   ├── MetricCard (Upside P90)
│   ├── MetricCard (Conservative P10)
│   └── MetricCard (vs. Quota %)
├── ForecastChart (13-week trajectory with confidence bands)
├── ScenariosGrid
│   ├── ScenarioCard (Likely)
│   ├── ScenarioCard (Upside)
│   └── ScenarioCard (Conservative)
└── ScenarioBuilder (inputs + calculate button)
```

#### HealthAlertsView

```
HealthAlertsView (page)
├── Header + Controls
├── AlertSummary (3 cards: critical, warning, resolved)
├── FilterGroup (type, severity)
├── AlertsList
│   └── AlertItem (icon, title, message, actions: snooze/dismiss)
└── HistorySection (timeline of last 30 days)
```

#### ComparativeAnalyticsView

```
ComparativeAnalyticsView (page)
├── Header + Controls
├── FilterGroup (period, segment)
├── ComparisonGrid (2-column)
│   ├── RepComparison (rep rankings with scores)
│   └── SegmentBreakdown (segment bars with values)
├── TrendsSection (3 cards: avg deal size, conversion rate, cycle time)
└── RankingTable (reps with percentile bars)
```

#### AdminConfigView

```
AdminConfigView (page)
├── Tabs: Model, Alert Rules, Features
├── ModelSettings
│   ├── ModelInfo (version, metrics)
│   ├── FeaturesList
│   ├── RetrainingSchedule (select)
│   └── Actions (train now, view history, reset)
├── AlertRulesSection
│   └── RuleItem (for each rule)
│       ├── Toggle (enabled/disabled)
│       ├── Threshold input
│       ├── Severity select
│       └── Check frequency select
└── FeatureToggles (notifications, reports, scenarios, etc)
```

---

## 🔌 API Endpoints

### Analytics Endpoints

**GET /api/v1/analytics/velocity**

```
Query params:
  - pipeline_id: string (required)
  - date_from: ISO-8601
  - date_to: ISO-8601

Response:
{
  "stage_distribution": {
    "discovery": 68,
    "qualification": 52,
    "proposal": 48,
    "negotiation": 32
  },
  "avg_days": 32.4,
  "pipeline_value": 4200000,
  "win_rate": 62.5,
  "deal_aging": [
    {"opportunity": "Acme", "days": 45, "avg_days": 20, "stage": "proposal"}
  ],
  "timestamp": "2026-09-09T14:32:00Z"
}

Cache: Redis, TTL 1h
Performance: <100ms (cached), <500ms (on-demand)
```

**GET /api/v1/analytics/rep-metrics**

```
Query params:
  - week: YYYY-W##
  - limit: int (default 50)

Response:
{
  "metrics": [
    {
      "user_id": "user123",
      "name": "João Costa",
      "value_closed": 580000,
      "conversion_rate": 0.68,
      "avg_cycle_days": 26,
      "deals_closed": 8,
      "rank": 1,
      "percentile": 95
    }
  ],
  "period": "2026-W36"
}

Cache: Redis, TTL 24h (weekly aggregation)
Performance: <200ms
```

### Scoring Endpoints

**GET /api/v1/scoring/opportunities**

```
Query params:
  - pipeline_id: string
  - sort: 'score' | 'confidence' | 'name' (default: score)
  - score_min: 0-100
  - score_max: 0-100
  - limit: int (default 100)

Response:
{
  "opportunities": [
    {
      "id": "opp123",
      "name": "Acme Corp",
      "score": 87,
      "confidence": 92,
      "factors": [
        {"name": "Email Engagement", "contribution": 28},
        {"name": "Meeting Frequency", "contribution": 19},
        {"name": "Account Growth", "contribution": 15}
      ],
      "deal_value": 250000,
      "stage": "proposal"
    }
  ],
  "distribution": {
    "80-100": 45,
    "60-79": 67,
    "40-59": 32,
    "20-39": 18,
    "0-19": 8
  }
}

Cache: Redis, TTL 4h (model-dependent)
Performance: <200ms (cached), <500ms (on-demand)
```

**POST /api/v1/scoring/score-now**

```
Request body:
{
  "opportunity_id": "opp123"
}

Response:
{
  "score": 87,
  "confidence": 92,
  "factors": [...],
  "model_version": "v2.3",
  "computed_at": "2026-09-09T14:32:00Z"
}

Performance: <200ms
```

### Forecast Endpoints

**GET /api/v1/forecast/baseline**

```
Query params:
  - pipeline_id: string
  - weeks: int (default: 13)
  - scenario: 'likely' | 'upside' | 'conservative' (default: likely)

Response:
{
  "forecast_date": "2026-09-09",
  "weeks": 13,
  "values": [150000, 210000, 280000, ...],
  "confidence_interval": [0.75, 0.95],
  "vs_quota": {
    "quota": 3000000,
    "forecast": 2840000,
    "achievement_pct": 94.7,
    "risk_pct": 5.3
  },
  "scenarios": {
    "likely": 2840000,
    "upside": 3210000,
    "conservative": 2120000
  }
}

Cache: Redis, TTL 4h
Performance: <1s (Monte Carlo simulation)
```

**POST /api/v1/forecast/custom-scenario**

```
Request body:
{
  "pipeline_id": "pipe123",
  "name": "Aggressive Growth",
  "inputs": {
    "conversion_rate": 0.70,
    "cycle_days": 24,
    "closes_per_week": 15
  }
}

Response:
{
  "scenario_id": "scen456",
  "forecast": 3100000,
  "delta_vs_baseline": 260000,
  "delta_pct": 9.2,
  "expires_at": "2026-10-09T14:32:00Z"
}

Performance: <200ms
```

### Alert Endpoints

**GET /api/v1/alerts/active**

```
Query params:
  - severity: 'critical' | 'warning' | 'info' (optional)
  - limit: int (default: 50)

Response:
{
  "alerts": [
    {
      "id": "alert789",
      "type": "stage_imbalance",
      "severity": "critical",
      "title": "Desequilíbrio de Stage Detectado",
      "message": "Pipeline Sales Direto: 65% em Discovery...",
      "pipeline_id": "pipe123",
      "created_at": "2026-09-09T14:32:00Z",
      "can_snooze": true,
      "can_dismiss": true
    }
  ],
  "summary": {
    "critical": 3,
    "warning": 8,
    "info": 2
  }
}

Performance: <100ms
```

**POST /api/v1/alerts/{alert_id}/snooze**

```
Request body:
{
  "duration_minutes": 60
}

Response: HTTP 200 OK

Performance: <50ms
```

### Admin Endpoints

**GET /api/v1/admin/model-status**

```
Response:
{
  "version": "v2.3",
  "status": "active",
  "trained_at": "2026-09-08T03:00:00Z",
  "next_training": "2026-09-09T03:00:00Z",
  "metrics": {
    "auc": 0.87,
    "precision": 0.84,
    "recall": 0.81,
    "f1_score": 0.83
  },
  "feature_count": 15,
  "training_schedule": "daily_03_utc"
}

Performance: <50ms
```

**PUT /api/v1/admin/alert-rules/{rule_type}**

```
Request body:
{
  "enabled": true,
  "threshold": 50,
  "severity": "critical",
  "check_frequency": "4_hours"
}

Response: HTTP 200 OK (updated rule)
Performance: <100ms (invalidates cache)
```

---

## 💾 Data Models

### Opportunity Score

```python
class OpportunityScore(Base):
    __tablename__ = "opportunity_score"

    id = Column(UUID, primary_key=True)
    org_id = Column(UUID, ForeignKey("organizations.id"))
    opportunity_id = Column(UUID, ForeignKey("opportunities.id"))
    score = Column(Integer)  # 0-100
    confidence = Column(Integer)  # 0-100
    factors = Column(JSONB)  # {factor_name: contribution_pct, ...} top 3
    model_version = Column(String)  # v2.3
    computed_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        Index("idx_opp_score_org_computed", org_id, computed_at.desc()),
        Index("idx_opp_score_opportunity", opportunity_id),
    )
```

### Scoring Model

```python
class ScoringModel(Base):
    __tablename__ = "scoring_model"

    id = Column(UUID, primary_key=True)
    org_id = Column(UUID, ForeignKey("organizations.id"))
    version = Column(String, unique=True)  # v2.3
    model_path = Column(String)  # s3://bucket/models/v2.3/model.pkl
    trained_at = Column(DateTime)
    metrics = Column(JSONB)  # {auc, precision, recall, f1}
    feature_importance = Column(JSONB)  # {feature: importance_score}
    is_active = Column(Boolean, default=True)
    next_training_scheduled = Column(DateTime)
```

### Forecast Baseline

```python
class ForecastBaseline(Base):
    __tablename__ = "forecast_baseline"

    id = Column(UUID, primary_key=True)
    org_id = Column(UUID, ForeignKey("organizations.id"))
    pipeline_id = Column(UUID, ForeignKey("pipelines.id"))
    forecast_date = Column(Date)
    scenario_type = Column(String)  # likely, upside, conservative
    values = Column(JSONB)  # {week_1: 150000, week_2: 210000, ...}
    margin_of_error_pct = Column(Float)  # confidence interval
    vs_quota_pct = Column(Float)
```

### Pipeline Health Alert

```python
class PipelineHealthAlert(Base):
    __tablename__ = "pipeline_health_alert"

    id = Column(UUID, primary_key=True)
    org_id = Column(UUID, ForeignKey("organizations.id"))
    alert_type = Column(String)  # stage_imbalance, velocity_slowdown, etc
    severity = Column(String)  # critical, warning, info
    message = Column(String)
    opportunity_id = Column(UUID, ForeignKey("opportunities.id"), nullable=True)
    stage_id = Column(UUID, nullable=True)
    user_id = Column(UUID, nullable=True)
    data = Column(JSONB)  # extra context
    created_at = Column(DateTime, default=utcnow)
    dismissed_at = Column(DateTime, nullable=True)
    snooze_until = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_alert_org_created", org_id, created_at.desc()),
        Index("idx_alert_severity", severity),
    )
```

---

## 🔄 Data Flows

### Scoring Flow

```
Daily Job (03:00 UTC)
├─ 1. Fetch all active opportunities for org
├─ 2. Extract 15 features (activities, emails, account metrics, etc)
├─ 3. Prepare feature vectors (normalize, handle nulls)
├─ 4. Load latest model from S3 (or Redis cache)
├─ 5. Predict probability for each opportunity
├─ 6. Extract top 3 factor contributions
├─ 7. Batch insert/update opportunity_score table
├─ 8. Update Redis cache for scoring queries
└─ 9. Log metrics (duration, count, errors)

Error Handling:
- If model unavailable: fallback to heuristic scoring
- If feature extraction fails: skip opportunity, log warning
- If DB insert fails: retry with exponential backoff
```

### Forecasting Flow

```
Daily Job (02:00 UTC)
├─ 1. Get pipeline config (stages, historical win rates, cycle times)
├─ 2. Fetch open opportunities (by stage distribution)
├─ 3. Monte Carlo Simulation (1000 scenarios)
│  ├─ Randomize: conversion rate ± std dev
│  ├─ Randomize: cycle days ± std dev
│  ├─ Calculate: closes per week × deal size distribution
│  └─ Sum: total revenue per week (13 weeks)
├─ 4. Calculate percentiles (P10, P50, P90)
├─ 5. Calculate confidence intervals
├─ 6. Compare vs. quota + calculate risk %
├─ 7. Insert/update forecast_baseline record
├─ 8. Backtest vs. actual (if historical data available)
└─ 9. Cache result in Redis (TTL 4h)
```

### Alert Evaluation Flow

```
Daily Job (04:00 UTC)
├─ 1. For each enabled alert rule:
│  ├─ a. Evaluate condition (e.g., stage distribution)
│  ├─ b. Check if alert already active (deduplication)
│  ├─ c. If condition met and no active alert → create alert
│  ├─ d. If condition NOT met and alert active → mark resolved
│  └─ e. Respect snooze windows
├─ 2. Send notifications (in-app, email digest, webhooks)
├─ 3. Update alert dashboard cache
└─ 4. Archive resolved alerts to history
```

---

## 🧪 Testing Strategy

### Unit Tests (50% coverage target)

- ScoringService: feature engineering, model prediction, fallback logic
- ForecastingService: Monte Carlo simulation, percentile calculation
- HealthMonitorService: alert rule evaluation, deduplication

### Integration Tests (30% coverage)

- API endpoints: request/response validation, auth, caching
- Database operations: transactions, constraint checks
- Background jobs: scheduling, error handling, retries

### E2E Tests (20% coverage)

- Full scoring pipeline: fetch data → predict → store → query
- Forecast generation: data fetch → simulation → storage → retrieval
- Alert lifecycle: creation → snooze/dismiss → resolution

### Performance Tests

- Load test: 1000 req/s to cached endpoints
- Scoring: 10K deals/day in <2 minutes
- Forecast: 1000 scenarios in <1 second

---

## 🔐 Security & Compliance

- **Multi-tenancy**: Todas as queries filtradas por org_id
- **Auth**: JWT tokens com scopes (read_analytics, configure_alerts, etc)
- **Audit**: Todas as mudanças em alert rules + admin config são logged
- **Data Privacy**: Opportunity scores nunca contêm PII
- **Rate Limiting**: 100 req/min por user para forecast custom scenarios

---

## 📈 Performance Optimization

### Caching Strategy

```
Redis Keys:
- analytics:velocity:{org_id} → TTL 1h
- scoring:model:{version} → TTL 24h
- forecast:baseline:{pipeline_id} → TTL 4h
- alerts:rules:{org_id} → TTL 30min
```

### Database Indexes

```sql
-- opportunity_score
CREATE INDEX idx_opp_score_org_computed
  ON opportunity_score(org_id, computed_at DESC);
CREATE INDEX idx_opp_score_opportunity
  ON opportunity_score(opportunity_id);

-- pipeline_health_alert
CREATE INDEX idx_alert_org_created
  ON pipeline_health_alert(org_id, created_at DESC);
CREATE INDEX idx_alert_severity
  ON pipeline_health_alert(severity);

-- analytics_pipeline_metric
CREATE INDEX idx_analytics_pipeline_date
  ON analytics_pipeline_metric(org_id, pipeline_id, metric_date DESC);
```

### Query Optimization

- Use materialized views for time-series data (update hourly/daily)
- Partition forecast_scenario table by org_id for archival
- Batch operations: 1000-record inserts at once
- Connection pooling: min 10, max 50 per service instance

---

## 🚀 Deployment Strategy

### Blue-Green Deployment

1. Deploy v0.6.0 to green environment
2. Run smoke tests (model scoring, forecast generation)
3. Validate alert rules on sample data
4. Switch traffic from blue to green
5. Keep blue running for 1h for quick rollback

### Rollback Plan

- If scoring fails: keep using v2.2 model
- If forecast fails: disable custom scenarios, serve pre-calculated baseline
- If alerts fail: disable new alerts, keep existing ones

### Monitoring & Alerting

- Dashboard load time (SLO: <500ms)
- Scoring latency (SLO: <200ms)
- Model accuracy drift (alert if AUC drops >5%)
- Alert precision (alert if false positive rate >5%)
- Background job SLA (99.9% uptime)
