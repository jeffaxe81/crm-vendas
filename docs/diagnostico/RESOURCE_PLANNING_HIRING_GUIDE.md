# Resource Planning & Hiring Guide for CRM SaaS Development

**Document Version**: 1.0  
**Scope**: Cycles 3-7 (Feb 2026 - Mar 2027) | **Total Duration**: 12 months  
**Prepared For**: Fundraising, HR, Executive Leadership

---

## 📊 Executive Summary

**Total Investment**: ~$2.1M (engineering salaries, infrastructure, tools)  
**Team Size**: 4 → 8 engineers (ramp-up over 12 months)  
**Time-to-Market**: v0.3.0 (2 months), v0.6.0 (7 months), v0.7.0 (9 months)  
**Break-even Customers**: 150-200 (at $2K-5K MRR per customer)

---

## 👥 Team Composition by Cycle

### **Cycle 3 (Jul-Aug 2026): Foundation Team - 4 Engineers**

**Headcount**: 4 FTE  
**Budget**: $480K (6-month run rate for salary + benefits)

#### Roles:

1. **Backend Lead** (1 FTE)
   - Title: Senior Backend Engineer
   - Salary: $140K-160K/yr
   - Responsibilities:
     - Design multi-tenant architecture, API layer
     - Implement authentication, database schema
     - Lead backend team, code reviews
     - Set performance & security standards
   - Requirements:
     - 8+ years backend development (Python, Node.js, Java)
     - Experience with FastAPI or similar async frameworks
     - Multi-tenant SaaS architecture experience
     - PostgreSQL optimization expertise
   - Hiring Timeline: June 2026 (2-month lead time)

2. **Frontend Lead** (1 FTE)
   - Title: Senior Frontend Engineer
   - Salary: $130K-150K/yr
   - Responsibilities:
     - Build React component library & design system
     - Implement routing, state management (Zustand)
     - Lead frontend architecture
     - Ensure accessibility (WCAG 2.1 AA) compliance
   - Requirements:
     - 8+ years React/modern JavaScript development
     - Design system experience (Figma, Storybook)
     - State management mastery (Redux, Zustand, Recoil)
     - TypeScript expert
   - Hiring Timeline: June 2026 (2-month lead time)

3. **DevOps/Infrastructure Engineer** (1 FTE)
   - Title: DevOps Engineer
   - Salary: $120K-140K/yr
   - Responsibilities:
     - Set up CI/CD (GitHub Actions)
     - Configure Docker, Kubernetes environments
     - Manage databases, backups, monitoring
     - Implement logging (ELK stack) & alerting
   - Requirements:
     - 5+ years DevOps/infrastructure
     - Kubernetes, Docker, Linux expertise
     - CI/CD pipeline setup (GitHub Actions, GitLab CI)
     - AWS or GCP cloud platforms
   - Hiring Timeline: June 2026 (2-month lead time)

4. **Full-stack Engineer** (1 FTE)
   - Title: Mid-level Full-stack Engineer
   - Salary: $100K-120K/yr
   - Responsibilities:
     - Feature implementation across stack
     - Testing framework implementation
     - Database optimization & indexing
     - Documentation & knowledge sharing
   - Requirements:
     - 4+ years full-stack development
     - Comfort across frontend + backend
     - SQL & database design
     - Testing expertise (unit, integration, E2E)
   - Hiring Timeline: June 2026 (2-month lead time)

**Hiring Strategy for Cycle 3**:

- Source through technical networks, referrals (best for senior hires)
- Offer competitive compensation + equity (0.5-1% for leads, 0.25-0.5% for mid-level)
- Remote-friendly roles (global talent pool)
- 2-week onboarding, pair programming sessions

---

### **Cycle 4 (Sep-Oct 2026): Core Feature Team - 5-6 Engineers**

**Headcount**: 5-6 FTE (+1 to +2 from C3)  
**Additional Budget**: $150K-180K (prorated 2-month addition)  
**Cumulative Budget**: $630K-660K

#### New Hires:

5. **Backend Engineer (Feature)** (1 FTE) - _New_
   - Title: Backend Engineer
   - Salary: $110K-130K/yr
   - Responsibilities:
     - Implement pipeline API, opportunity CRUD
     - Build win-rate analytics
     - Work closely with Backend Lead
   - Requirements:
     - 4+ years backend development
     - FastAPI or similar experience
     - SQL optimization knowledge
   - Hiring Timeline: August 2026 (1-month lead time)

6. **Frontend Engineer (Feature)** (1 FTE) - _New_
   - Title: Frontend Engineer
   - Salary: $100K-120K/yr
   - Responsibilities:
     - Build pipeline UI, opportunity forms
     - Implement data visualizations (charts, tables)
     - Performance optimization for dashboards
   - Requirements:
     - 3+ years React development
     - Experience with Recharts or D3.js
     - Responsive design expertise
   - Hiring Timeline: August 2026 (1-month lead time)

#### Existing Team Role Shifts:

- **Backend Lead**: Shifts to Backend Tech Lead (mentoring new engineer, architecture decisions)
- **Frontend Lead**: Shifts to Frontend Tech Lead (component library expansion)
- **DevOps**: Continues infrastructure + database optimization
- **Full-stack**: Specialize toward testing framework + performance optimization

**Hiring Strategy for Cycle 4**:

- 1-2 new engineers from referrals or active recruiting
- Prioritize engineers who can ship quickly (less time for onboarding)
- Offer 2-3 week ramp-up with pair programming

---

### **Cycle 5 (Oct-Nov 2026): Email & Communications - 5-6 Engineers**

**Headcount**: 5-6 FTE (overlap with C4)  
**Budget**: Stable from C4 + optional contractor  
**Cumulative Budget**: $630K-660K (stable)

#### Roles (Mostly Overlap from C4):

- **Backend (2 FTE)**: One continues from C4 feature work, one focuses on email integrations
- **Frontend (2 FTE)**: One continues UI work, one focuses on email template builder
- **DevOps (1 FTE)**: Email webhook setup, email provider API management
- **Optional Contractor (0.5 FTE)**: Email integration specialist (SendGrid, Gmail APIs)

**Hiring Strategy for Cycle 5**:

- No new full-time hires (use existing team + optional contractor)
- Contract speciality expert for 2-3 months (email integration spikes)
- Cost: $15K-20K for contractor (2-3 month contract)

---

### **Cycle 6 (Oct-Jan 2027): Analytics & AI/ML - 6 Engineers**

**Headcount**: 6 FTE  
**Additional Budget**: $150K-180K (new ML engineer + frontend specialist)  
**Cumulative Budget**: $780K-840K

#### New Hires:

7. **ML/Data Engineer** (1 FTE) - _New_
   - Title: Machine Learning Engineer
   - Salary: $140K-170K/yr (ML specialists command premium)
   - Responsibilities:
     - Design & train scoring models (Logistic Regression, baseline)
     - Feature engineering (15-feature pipeline)
     - Model evaluation, backtesting, performance tracking
     - Set up automated model training (APScheduler)
   - Requirements:
     - 5+ years ML/data science experience
     - Python, scikit-learn expertise
     - Statistics & model evaluation knowledge
     - SQL for data extraction
   - Hiring Timeline: July 2026 (3-month lead time - critical path)

8. **Senior Frontend Engineer (Analytics)** (1 FTE) - _New_
   - Title: Senior Frontend Engineer (Analytics/Data Viz)
   - Salary: $130K-150K/yr
   - Responsibilities:
     - Lead analytics dashboard development
     - Data visualization (Recharts, custom D3)
     - Real-time dashboard performance
     - Complex state management for analytics
   - Requirements:
     - 7+ years React development
     - Recharts or D3.js expertise
     - Experience with large datasets & performance
     - TypeScript expert
   - Hiring Timeline: July 2026 (2-month lead time)

#### Team Composition:

- **Backend (2 FTE)**: Continue feature work + new analytics services
- **Frontend (2 FTE)**: Analytics dashboards (new hire focuses on data viz)
- **DevOps (1 FTE)**: Caching strategy (Redis), materialized view maintenance
- **ML Engineer (1 FTE)**: New - scoring & forecasting models

**Hiring Strategy for Cycle 6**:

- **Critical Hire**: ML Engineer (longest lead time, foundational for Cycle 6)
- Recruit from:
  - Academia (PhD programs, data science bootcamp instructors)
  - Data science teams at larger companies
  - Kaggle competition winners
- Offer: Competitive salary + equity (0.5-1%)
- 3-week onboarding with senior engineers

---

### **Cycle 7 (Feb-Mar 2027): Advanced ML & Automation - 8 Engineers**

**Headcount**: 8 FTE (+2 from C6)  
**Additional Budget**: $200K-240K (new specialized engineers)  
**Cumulative Budget**: $980K-1,080K

#### New Hires:

9. **ML/Data Engineer (Advanced Models)** (1 FTE) - _New_
   - Title: ML Engineer (Advanced Models)
   - Salary: $150K-180K/yr
   - Responsibilities:
     - Build ensemble models (Random Forest, XGBoost)
     - Implement feature importance & explainability (SHAP)
     - Model monitoring & drift detection
     - Hyperparameter tuning & optimization
   - Requirements:
     - 7+ years ML experience
     - XGBoost, Random Forest expertise
     - Model interpretability experience
     - Experiment tracking (MLflow, Weights & Biases)
   - Hiring Timeline: December 2026 (2-month lead time)

10. **Full-stack Engineer (Workflow Automation)** (1 FTE) - _New_
    - Title: Senior Full-stack Engineer
    - Salary: $130K-150K/yr
    - Responsibilities:
      - Build workflow automation engine
      - Implement rules engine, triggers, actions
      - Create playbook recommendation system
      - Async job processing (Celery/RQ)
    - Requirements:
      - 6+ years full-stack development
      - Experience with complex rule engines
      - Async job processing (Celery, RQ, BullMQ)
      - Real-time event processing
    - Hiring Timeline: December 2026 (2-month lead time)

#### Team Composition (Cycle 7):

- **Backend (2 FTE)**: Workflow services, recommendation engine
- **Frontend (2 FTE)**: Workflow builder UI, analytics dashboards
- **ML Engineers (2 FTE)**: Ensemble models, churn prediction, territory optimization
- **DevOps (1 FTE)**: Model serving infrastructure, job scheduling
- **Full-stack Specialist (1 FTE)**: Automation engine (new hire focuses on this)

**Hiring Strategy for Cycle 7**:

- Recruit experienced ML engineers (harder than junior)
- Full-stack automation specialist (rare skillset)
- Offer equity sweeteners (0.5-1%) given later stage hiring

---

## 💰 Financial Projections

### **Engineering Salary Budget by Cycle**

```
Cycle 3 (Jul-Aug):    $480K  (4 engineers × 6 months avg = $480K)
Cycle 4 (Sep-Oct):    $630K  (5.5 engineers × 2 months = $183K)
Cycle 5 (Oct-Nov):    $630K  (5.5 engineers × 2 months = $183K)
Cycle 6 (Oct-Jan):    $780K  (6 engineers × 4 months = $300K)
Cycle 7 (Feb-Mar):    $980K  (8 engineers × 2 months = $247K)

Total Engineering Salary: ~$1.3M (12 months, blended average)
```

### **Infrastructure & Tools Budget by Cycle**

```
Database (AWS RDS PostgreSQL):       $500/month  ($6K/year)
Caching (Redis Cloud):                $200/month  ($2.4K/year)
CI/CD (GitHub Pro):                   $21/month   ($250/year)
Monitoring (DataDog):                 $500/month  ($6K/year)
ML Libraries (cloud GPU if needed):    $200/month  ($2.4K/year)
Email (SendGrid):                     $300/month  ($3.6K/year)
Third-party APIs (stripe, maps, etc): $300/month  ($3.6K/year)

Total Infrastructure: ~$90K/year (averaged across cycles)
```

### **Total 12-Month Investment**

```
Engineering Salaries:           $1.3M
Infrastructure & Tools:         $90K
Contractor/Specialist (Email):  $25K
Office/Admin/Legal:             $50K
Contingency (15%):              $255K
─────────────────────────────────────
TOTAL INVESTMENT:               $1.72M
```

### **Break-even Analysis**

**Customer Acquisition Model:**

- ASP (Annual Subscription Price): $30K (SMB), $50K (Mid-market), $100K+ (Enterprise)
- Blended ASP: $50K/year → $4,166/month MRR per customer
- Churn Rate: 5% monthly initially (high-touch sales)
- Target: 50 customers by end of C6, 100+ by end of C7

**Revenue Projection:**

```
End of C4 (Oct):        0 customers    $0/MRR    (Pre-launch)
End of C5 (Nov):        2 customers    $8K/MRR   (Soft launch, beta)
End of C6 (Jan):       15 customers   $63K/MRR   (v0.6.0 launch)
End of C7 (Mar):       35 customers  $146K/MRR   (Advanced features)
```

**Payback Period:**

- Investment: $1.72M
- Monthly burn (avg): $150K ($1.8M/year)
- MRR at Mar 2027: $146K
- **Break-even: ~12-13 months from project start**
- **ROI: Positive by Q2 2027 (if customer acquisition stays on track)**

---

## 📈 Hiring Roadmap Timeline

```
2026
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  Jun     │  Jul-Aug │  Sep     │  Oct-Jan │  Feb-Mar │
│ Cycle 3  │ Cycle 3  │ Cycle 4  │ Cycle 6  │ Cycle 7  │
│ Hiring   │ Running  │ +1-2     │ +2 (ML)  │ +2       │
│ 4 FTE    │ 4 FTE    │ 5-6 FTE  │ 6 FTE    │ 8 FTE    │
└──────────┴──────────┴──────────┴──────────┴──────────┘
  Start      Ramp       Scale      Specialize  Advanced
```

### **Detailed Hiring Timeline**

| Date     | Role             | Position          | Level  | Salary    | Status         |
| -------- | ---------------- | ----------------- | ------ | --------- | -------------- |
| Jun 2026 | Backend Lead     | Sr Backend Eng    | Lead   | $140-160K | **HIRE FIRST** |
| Jun 2026 | Frontend Lead    | Sr Frontend Eng   | Lead   | $130-150K | **HIRE FIRST** |
| Jun 2026 | DevOps           | DevOps Eng        | Mid    | $120-140K | **HIRE FIRST** |
| Jun 2026 | Full-stack       | Full-stack Eng    | Mid    | $100-120K | **HIRE FIRST** |
| Jul 2026 | ML Engineer      | ML Eng (Baseline) | Senior | $140-170K | **CRITICAL**   |
| Jul 2026 | Analytics FE     | Sr Frontend Eng   | Senior | $130-150K | **PRIORITY**   |
| Aug 2026 | Backend Feature  | Backend Eng       | Mid    | $110-130K | Standard       |
| Aug 2026 | Frontend Feature | Frontend Eng      | Mid    | $100-120K | Standard       |
| Dec 2026 | ML Advanced      | ML Eng (Ensemble) | Senior | $150-180K | Priority       |
| Dec 2026 | Workflow Eng     | Sr Full-stack Eng | Senior | $130-150K | Priority       |

---

## 🎯 Key Hiring Criteria & Interview Process

### **Universal Criteria (All Roles)**

1. **Strong Communication**: Can explain technical concepts clearly
2. **Problem Solving**: Creative solutions to ambiguous problems
3. **Ownership Mentality**: Takes responsibility for outcomes
4. **Collaboration**: Works well in small teams, async communication
5. **Learning Agility**: Quickly adopts new technologies, asks good questions

### **Backend Engineer Interviews** (4-5 rounds, 6 hours total)

**Round 1: Screening Call (30 min)**

- Background, experience, motivation
- Quick tech questions (multi-tenancy architecture, PostgreSQL optimization)
- Compensation expectations

**Round 2: Take-home Coding Challenge (2 hours)**

- Build a small REST API (Python/FastAPI or Node.js)
- Include database design, error handling, tests
- Evaluation: Code quality, architecture, testing mindset

**Round 3: System Design (90 min)**

- Design a multi-tenant CRM pipeline management system
- Cover: Schema design, API layer, scaling considerations
- Evaluate: Architecture knowledge, trade-offs thinking

**Round 4: Technical Deep-dive (60 min)**

- Review take-home code, ask follow-up questions
- Discuss production challenges (database performance, caching, monitoring)
- Evaluate: Technical depth, experience with real systems

**Round 5: Culture Fit (30 min)**

- Chat with Backend Lead or CEO
- Discuss team, culture, growth opportunities
- Final questions

### **Frontend Engineer Interviews** (4 rounds, 5 hours total)

**Round 1: Screening Call (30 min)**

- Background, React experience, component library knowledge
- Quick tech questions (state management, performance optimization)

**Round 2: Component Building Challenge (2 hours)**

- Build a reusable React component with specific requirements
- Include TypeScript, tests, documentation
- Evaluation: React patterns, accessibility, testing

**Round 3: System Design (90 min)**

- Design a real-time analytics dashboard (like Cycle 6 requirements)
- Cover: Component hierarchy, state management, performance
- Evaluate: Architecture thinking, UX awareness

**Round 4: Culture Fit & Pairing (60 min)**

- Pair program with Frontend Lead on real codebase
- Small feature implementation or bug fix
- Evaluate: Collaboration, code quality, learning

### **ML Engineer Interviews** (5 rounds, 7-8 hours total)

**Round 1: Screening Call (30 min)**

- ML background, projects, why interested
- Quick ML questions (model evaluation, feature engineering)

**Round 2: Machine Learning Challenge (3 hours, take-home)**

- Build ML model with provided dataset (opportunity scoring)
- Deliverables: EDA, model training, evaluation, interpretation
- Evaluation: ML fundamentals, experimentation approach

**Round 3: System Design (90 min)**

- Design ML system for opportunity scoring (Cycle 6 requirements)
- Cover: Feature pipeline, model training, monitoring, serving
- Evaluate: ML systems thinking, production awareness

**Round 4: Deep Technical (90 min)**

- Present past ML project (from portfolio)
- Discuss challenges, decisions, results
- Evaluate: Technical depth, real-world experience

**Round 5: Culture Fit (30 min)**

- Chat with ML lead and team
- Discuss collaboration with engineers, product thinking

---

## 🌱 Onboarding & Training Program

### **Week 1: Orientation**

- Day 1: Company overview, culture, product vision
- Day 2: Development environment setup (GitHub, IDE, local dev server)
- Day 3: First pull request (documentation, test fix)
- Day 4-5: Code walkthrough (architecture, key components)

### **Weeks 2-3: Deep Dive**

- Pair programming with team lead (2-3 days/week)
- Small feature implementation under supervision
- Code review feedback & learning
- Weekly 1-on-1 with manager

### **Week 4: First Solo Feature**

- Pick small story (8 pts or less)
- Implement independently with PR reviews
- Deployment to staging environment
- Participation in sprint retro

### **Ongoing (Months 2-3)**

- Gradually increasing complexity of tasks
- Mentorship from team lead (1-2 hrs/week)
- Tech talks & knowledge sharing sessions
- Goal: Full productivity by week 8-12

### **Success Metrics**

- First PR merged by Day 3 (docs/tests)
- Independent feature shipped by Week 4
- On the critical path by Month 2
- Productive team member by Month 3

---

## 🏢 Organizational Structure (By Cycle 7)

```
CEO / Founder
│
├─ VP Engineering (Backend Lead becomes Engineering Lead)
│  ├─ Backend Team Lead (Sr Backend Eng)
│  │  ├─ Backend Engineer (Feature)
│  │  └─ Backend Engineer (API/Services)
│  │
│  ├─ Frontend Team Lead (Sr Frontend Eng)
│  │  ├─ Frontend Engineer (UI Components)
│  │  └─ Frontend Engineer (Analytics)
│  │
│  ├─ ML Lead (ML Engineer, Advanced)
│  │  └─ ML Engineer (Baseline/Models)
│  │
│  ├─ DevOps/Infrastructure Engineer
│  │
│  └─ QA/Testing (Full-stack or dedicated)
│
├─ VP Product
│  ├─ Product Manager
│  └─ UX/Design
│
└─ VP Sales (Hired separately)
```

---

## 🎓 Professional Development Budget

**Per Engineer**: $2,500-3,500/year

- Conference attendance: $1,500 (1 major conference/year)
- Online courses: $500 (ML, cloud, leadership)
- Books & learning: $200
- Local meetups/events: $300

**Total**: ~$20K-28K/year (8 engineers × $2.5K avg)

---

## 🔄 Performance Metrics & Retention

### **Engineering KPIs**

- **Velocity**: Story points shipped per sprint (target: 20-25 pts/week/engineer)
- **Quality**: Bug escape rate <5%, test coverage >90%
- **Deployment Frequency**: Deploys multiple times/week
- **Lead Time**: Feature to production <2 weeks
- **MTTR**: Mean time to recovery from incidents <1 hour

### **Retention Strategy**

1. **Competitive Compensation**: 75th percentile for market
2. **Equity**: 0.25-1% depending on level & timing
3. **Career Growth**: Clear path (IC → Tech Lead → Manager)
4. **Autonomy**: Engineers own their features (from design to production)
5. **Learning**: Dedicated PD budget, internal tech talks
6. **Work-life Balance**: Remote-friendly, flexible hours
7. **Impact**: Clear connection to business outcomes

**Retention Target**: 85%+ (tech industry standard is 70-75%)

---

## 📋 Hiring Challenges & Mitigations

| Challenge                             | Impact | Mitigation                                         |
| ------------------------------------- | ------ | -------------------------------------------------- |
| ML Engineer shortage                  | High   | Start recruiting 3 months early, referral bonuses  |
| Remote competition                    | Medium | Competitive salary, equity, mission-driven pitch   |
| Onboarding complexity                 | Medium | Detailed runbooks, pair programming, internal wiki |
| Burnout in scaling phase              | Medium | Watch velocity, add headcount early, 20% time      |
| Skill gaps (async, distributed teams) | Low    | Training, documentation, async communication norms |

---

## 🎯 Next Steps

1. **Immediately (This Month)**:
   - Approve $1.72M investment for 12-month roadmap
   - Start recruiting Backend & Frontend Leads (4-6 week lead time)
   - Finalize compensation & equity bands

2. **June 2026**:
   - Onboard 4-person founding team
   - Set up development environment & infrastructure

3. **July 2026**:
   - Hire ML Engineer (start training immediately)
   - Hire Sr Analytics Frontend Engineer
   - Begin Cycle 3 execution

4. **August 2026**:
   - Hire 2 additional feature engineers (Cycle 4 prep)
   - Complete Cycle 3 foundation

5. **Ongoing**:
   - Quarterly hiring reviews (are we on pace?)
   - Monthly 1-on-1s with all reports (engagement, growth)
   - Half-yearly retention & compensation reviews

---

## 📚 Resources & References

- **Salary Benchmarking**: Levels.fyi, Glassdoor, SalaryProject
- **Hiring**: Y Combinator's "How to Hire" series
- **ML Team Building**: DeepLearning.AI's industry insights
- **Onboarding Best Practices**: Silicon Valley Product Group resources

---

**Document Version**: 1.0  
**Last Updated**: September 15, 2026  
**Next Review**: December 2026 (post-Cycle 4 assessment)  
**Owner**: CEO / VP Engineering
