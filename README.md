# Bank-Loan-prediction
# 🛡️ RiskFlow — Intelligent Bank Loan Risk & Credit Analytics Engine

[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-%23F7931E.svg?style=for-the-badge&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**RiskFlow** is an end-to-end Machine Learning web application designed to evaluate bank loan applicant default risk, automate credit approval decisions, stress-test portfolios against macroeconomic shocks, and provide real-time risk analytics via an interactive glassmorphic dashboard.

---

## 🌟 Key Features

1. **🤖 Machine Learning Credit Scoring Engine**
   - Random Forest Classifier trained on historical credit applicant dataset.
   - Evaluates credit history, debt-to-income, applicant and co-applicant income, loan amount, purpose, property area, and employment history.
   - Computes default probability, approval status, risk grade (Low, Medium, High), APR estimate, and max loan recommendation.

2. **🎛️ Dynamic What-If Risk Simulator**
   - Real-time adjustment sliders for credit metrics, DTI ratio, monthly income, and loan size.
   - Instant calculation of score impact and APR adjustments.

3. **📊 Portfolio Analytics Dashboard**
   - Rendered using Chart.js with dark glassmorphism UI styling.
   - Displays portfolio risk grade distribution and SHAP-like feature importance rankings.

4. **💥 Macroeconomic Portfolio Stress Testing (`/stress-test`)**
   - Simulates portfolio default rates and financial loss under interest rate hikes, inflation spikes, and recessionary income reductions.

5. **📅 Loan Amortization & Repayment Calculator (`/amortization`)**
   - Generates month-by-month principal vs interest repayment schedules.

6. **📁 Bulk CSV Screening Engine (`/batch-predict`)**
   - Audit and screen multiple loan applications in a single batch request.

7. **⚡ Dual-Engine Fallback Architecture**
   - Client-side heuristic fallback engine ensuring 100% web application functionality even when backend API is offline.

---

## 📁 Repository Structure

```
bank-loan-risk-predictor/
├── backend/
│   ├── app.py             # FastAPI REST API server (endpoints: /predict, /metrics, /stress-test, /amortization, /batch-predict)
│   ├── model.py           # Random Forest ML training pipeline script
│   ├── data_generator.py  # Dataset generator & preprocessor script
│   ├── loan_classifier.joblib # Serialized trained ML pipeline
│   ├── model_stats.joblib      # Serialized feature importances & metrics
│   ├── loan_data.csv       # Training dataset
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── index.html         # Glassmorphic single page dashboard
│   ├── styles.css         # Modern dark design system tokens & animations
│   └── app.js             # Client UI controller, Chart.js integrations & fallback engine
├── .gitignore             # Git ignore configuration
└── README.md              # Documentation
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup (FastAPI & ML Engine)

Navigate to the `backend` directory and install dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Train or refresh the Machine Learning model:

```bash
python model.py
```

Start the FastAPI backend server:

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

The API will be live at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

### 2. Frontend Launch

Open `frontend/index.html` directly in your web browser, or serve it using Python:

```bash
cd frontend
python -m http.server 3000
```

Access the dashboard at `http://127.0.0.1:3000`.

---

## 🔑 Demo Credentials

- **Risk Analyst Admin Portal**: Account `ANALYST` | PIN `1234`
- **Customer Account Lookup**: Account `LP001003`

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
