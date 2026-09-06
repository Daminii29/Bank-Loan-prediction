// RiskFlow Excel Frontend Controller

const API_BASE_URL = 'http://127.0.0.1:8000';
let isBackendOnline = false;
let portfolioData = []; // Local portfolio for fallback mode
let riskChart = null;
let featureChart = null;

// Session State variables
let isLoggedIn = false;
let userRole = null; // 'analyst' or 'customer'
let userAccountNo = null;
let userRecord = null; // Holds the active user's loan record if role is customer

// Initialize sample portfolio data matching the Excel schema for local fallback mode
function initFallbackPortfolio() {
    portfolioData = [];
    const seedRandom = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return () => {
            const x = Math.sin(hash++) * 10000;
            return x - Math.floor(x);
        };
    };
    
    const rng = seedRandom("riskflow-excel");
    for (let i = 0; i < 60; i++) {
        const credit_history = rng() > 0.18 ? 1 : 0;
        const applicant_income = Math.floor(2500 + rng() * 7500);
        const coapplicant_income = rng() > 0.4 ? Math.floor(500 + rng() * 3000) : 0;
        const amount = Math.floor(40 + rng() * 260); // In thousands
        const term = rng() > 0.1 ? 360 : 180;
        
        const gender = rng() > 0.5 ? "Male" : "Female";
        const married = rng() > 0.35 ? "Yes" : "No";
        const dependents = rng() > 0.5 ? "0" : rng() > 0.5 ? "1" : rng() > 0.5 ? "2" : "3+";
        const education = rng() > 0.22 ? "Graduate" : "Not Graduate";
        const self_employed = rng() > 0.1 ? "No" : "Yes";
        const property_area = rng() > 0.6 ? "Urban" : rng() > 0.5 ? "Semiurban" : "Rural";
        const purpose = rng() > 0.7 ? "HOME" : rng() > 0.5 ? "CAR" : rng() > 0.3 ? "EDUCATION" : "GOLD";
        
        // Calculate fallback probability
        const annual_income = (applicant_income + coapplicant_income) * 12;
        const lti = (amount * 1000) / Math.max(1000, annual_income);
        
        let logit = 0.5 - (3.5 * credit_history) + (4.0 * lti);
        if (education === 'Not Graduate') logit += 0.5;
        if (self_employed === 'Yes') logit += 0.3;
        
        const prob = 1.0 / (1.0 + Math.exp(-logit));
        const finalProb = Math.max(0.01, Math.min(0.99, prob));
        
        const risk = finalProb > 0.45 ? "High" : finalProb > 0.18 ? "Medium" : "Low";
        const approved = credit_history === 1 && finalProb < 0.40;
        
        portfolioData.push({
            gender, married, dependents, education, self_employed,
            applicant_income, coapplicant_income, amount: amount * 1000.0, term,
            credit_history, property_area, purpose,
            probability: finalProb, risk_grade: risk, approved
        });
    }
}

// Check Backend Status
async function checkBackendConnection() {
    const dot = document.getElementById('api-status-dot');
    const label = document.getElementById('api-status-text');
    const mode = document.getElementById('api-mode-text');
    
    try {
        const response = await fetch(`${API_BASE_URL}/`, { method: 'GET', signal: AbortSignal.timeout(2000) });
        if (response.ok) {
            isBackendOnline = true;
            dot.className = 'status-indicator online';
            label.innerText = 'Connected';
            mode.innerText = 'Excel Trained RF';
            console.log("RiskFlow Engine: FastAPI Backend online.");
        } else {
            throw new Error("HTTP connection issue");
        }
    } catch (e) {
        isBackendOnline = false;
        dot.className = 'status-indicator offline';
        label.innerText = 'Local Fallback';
        mode.innerText = 'In-Browser Scoring';
        console.warn("RiskFlow Engine: Backend offline. Switching to client-side fallback solver.", e);
        if (portfolioData.length === 0) {
            initFallbackPortfolio();
        }
    }
}

// Check Session on App Load
function checkSession() {
    const cachedRole = sessionStorage.getItem('user_role');
    const cachedAccount = sessionStorage.getItem('user_account');
    
    if (cachedRole && cachedAccount) {
        applyLoginState(cachedRole, cachedAccount);
    } else {
        applyLogoutState();
    }
}

// Apply Login State to UI
async function applyLoginState(role, accountNo) {
    isLoggedIn = true;
    userRole = role;
    userAccountNo = accountNo;
    
    sessionStorage.setItem('user_role', role);
    sessionStorage.setItem('user_account', accountNo);
    
    const body = document.body;
    body.classList.remove('logged-out');
    body.classList.add('logged-in', `role-${role}`);
    
    // Hide error messages
    document.getElementById('login-error-msg').classList.add('hidden');
    
    // Set Sidebar Nav Item Visibility
    document.querySelectorAll('.analyst-only').forEach(el => {
        if (role === 'analyst') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    
    document.querySelectorAll('.customer-only').forEach(el => {
        if (role === 'customer') el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    
    // Set Profile Displays
    const roleDisplay = document.getElementById('user-display-role');
    const avatarDisplay = document.getElementById('user-display-avatar');
    
    // De-activate all tabs and activate role-specific default tab
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    
    if (role === 'analyst') {
        roleDisplay.innerText = 'Risk Analyst';
        avatarDisplay.innerText = 'RA';
        
        const defaultTabBtn = document.querySelector('.nav-btn[data-tab="evaluator"]');
        if (defaultTabBtn) defaultTabBtn.classList.add('active');
        const defaultTab = document.getElementById('evaluator-tab');
        if (defaultTab) defaultTab.classList.add('active');
    } else {
        roleDisplay.innerText = `Account ${accountNo}`;
        avatarDisplay.innerText = accountNo.slice(0, 2).toUpperCase();
        
        // Fetch and load customer loan application
        await fetchAndLoadCustomerRecord(accountNo);
        
        const defaultTabBtn = document.querySelector('.nav-btn[data-tab="customer-loan"]');
        if (defaultTabBtn) defaultTabBtn.classList.add('active');
        const defaultTab = document.getElementById('customer-loan-tab');
        if (defaultTab) defaultTab.classList.add('active');
    }
}

// Fetch and load a customer record into UI
async function fetchAndLoadCustomerRecord(accountNo) {
    userRecord = null;
    
    if (isBackendOnline) {
        try {
            const res = await fetch(`${API_BASE_URL}/accounts/${accountNo}`);
            if (res.ok) {
                userRecord = await res.json();
            } else {
                throw new Error("Account API Error");
            }
        } catch (e) {
            console.error("Backend fetch error for account details. Querying local portfolio.", e);
            userRecord = findLocalCustomerRecord(accountNo);
        }
    } else {
        userRecord = findLocalCustomerRecord(accountNo);
    }
    
    if (userRecord) {
        // Populate profile detail fields
        document.getElementById('cust-loan-id').innerText = userRecord.loan_id;
        document.getElementById('cust-gender').innerText = userRecord.gender;
        document.getElementById('cust-married').innerText = userRecord.married;
        document.getElementById('cust-dependents').innerText = userRecord.dependents;
        document.getElementById('cust-education').innerText = userRecord.education;
        document.getElementById('cust-self-employed').innerText = userRecord.self_employed;
        document.getElementById('cust-income').innerText = `$${Math.round(userRecord.applicant_income).toLocaleString()}/mo`;
        document.getElementById('cust-coincome').innerText = `$${Math.round(userRecord.coapplicant_income).toLocaleString()}/mo`;
        document.getElementById('cust-amount').innerText = `$${Math.round(userRecord.amount).toLocaleString()}`;
        document.getElementById('cust-term').innerText = `${userRecord.term} Months`;
        document.getElementById('cust-property').innerText = userRecord.property_area;
        document.getElementById('cust-purpose').innerText = userRecord.purpose;
        
        // Update verdict display for customer loan
        const prob = userRecord.probability;
        const probPct = Math.round(prob * 100);
        
        document.getElementById('cust-probability-pct').innerText = `${probPct}%`;
        
        // Gauge fill
        const fill = document.getElementById('cust-gauge-fill');
        const strokeDash = 126;
        const offset = strokeDash - (prob * strokeDash);
        fill.style.strokeDashoffset = offset;
        
        if (prob > 0.45) fill.style.stroke = 'var(--color-danger)';
        else if (prob > 0.18) fill.style.stroke = 'var(--color-warning)';
        else fill.style.stroke = 'var(--color-success)';
        
        // Badge
        const badge = document.getElementById('cust-grade-badge');
        const decisionText = document.getElementById('cust-decision-text');
        const riskClass = userRecord.risk_grade.toLowerCase();
        
        badge.innerText = `${userRecord.risk_grade} Risk`.toUpperCase();
        badge.className = `badge ${riskClass}`;
        
        if (userRecord.approved) {
            decisionText.innerText = 'APPROVED';
            decisionText.className = 'status-msg text-approved';
        } else {
            decisionText.innerText = 'REJECTED';
            decisionText.className = 'status-msg text-rejected';
        }
        
        // Recommendations list
        const list = document.getElementById('cust-recommendation-list');
        list.innerHTML = '';
        
        const recommendations = generateRecommendations(userRecord);
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.innerText = rec;
            list.appendChild(li);
        });
        
        // Pre-fill customer eligibility form
        document.getElementById('cust-elig-applicant-income').value = Math.round(userRecord.applicant_income);
        document.getElementById('cust-elig-coapplicant-income').value = Math.round(userRecord.coapplicant_income);
        document.getElementById('cust-elig-loan-amount').value = Math.round(userRecord.amount / 1000);
        document.getElementById('cust-elig-loan-term').value = userRecord.term;
        document.getElementById('cust-elig-purpose').value = userRecord.purpose;
        document.getElementById('cust-elig-property-area').value = userRecord.property_area;
        
        // Lock static attributes in hidden fields
        document.getElementById('cust-elig-gender').value = userRecord.gender;
        document.getElementById('cust-elig-married').value = userRecord.married;
        document.getElementById('cust-elig-dependents').value = userRecord.dependents;
        document.getElementById('cust-elig-education').value = userRecord.education;
        document.getElementById('cust-elig-self-employed').value = userRecord.self_employed;
        document.getElementById('cust-elig-credit-history').value = userRecord.credit_history;
    } else {
        console.error("No record found matching the active Customer account.");
    }
}

// Generate simple visual recommendations for UI
function generateRecommendations(rec) {
    const list = [];
    if (rec.approved) {
        list.push("Application approved based on credit standards.");
        if (rec.applicant_income < 3000) {
            list.push("Low monthly income. Avoid incremental borrowing.");
        }
    } else {
        list.push("Application rejected due to high risk calculation.");
        if (rec.credit_history === 0) {
            list.push("No clear credit profile on record. Improving payment history is highly recommended.");
        }
        if (rec.probability >= 0.40) {
            list.push("Default risk prediction index exceeds the allowable safety margin.");
        }
    }
    const annual_income = (rec.applicant_income + rec.coapplicant_income) * 12;
    if (rec.amount > annual_income * 0.4) {
        list.push("Requested loan size represents high DTI leverage. Consider a smaller principal request.");
    }
    return list;
}

// Find Customer application record locally
function findLocalCustomerRecord(accountNo) {
    const search_id = accountNo.trim().toUpperCase();
    if (portfolioData.length === 0) initFallbackPortfolio();
    
    return portfolioData.find(d => {
        const id = d.loan_id.toUpperCase();
        return id === search_id || id === search_id.replace("ACC-", "") || search_id === `ACC-${id}`;
    });
}

// Perform Login Request
async function performLogin(accountNo, pin) {
    const errorMsg = document.getElementById('login-error-msg');
    errorMsg.classList.add('hidden');
    
    const acc = accountNo.trim().toUpperCase();
    
    if (acc === 'ANALYST') {
        if (pin === 'admin' || pin === '1234' || pin === 'admin123') {
            applyLoginState('analyst', 'ANALYST');
            return true;
        } else {
            showLoginError("Incorrect PIN for Risk Analyst.");
            return false;
        }
    }
    
    if (isBackendOnline) {
        try {
            const res = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_no: accountNo, pin: pin })
            });
            if (res.ok) {
                const data = await res.json();
                applyLoginState(data.role, data.account_no);
                return true;
            } else {
                const err = await res.json();
                showLoginError(err.detail || "Authentication failed.");
                return false;
            }
        } catch (e) {
            console.error("FastAPI login error. Attempting local lookup.", e);
            return performLocalLogin(accountNo, pin);
        }
    } else {
        return performLocalLogin(accountNo, pin);
    }
}

function performLocalLogin(accountNo, pin) {
    const record = findLocalCustomerRecord(accountNo);
    if (record) {
        applyLoginState('customer', record.loan_id);
        return true;
    } else {
        showLoginError("Account No not found. Try demo ID LP001003.");
        return false;
    }
}

function showLoginError(msg) {
    const card = document.getElementById('login-error-msg');
    const txt = document.getElementById('login-error-text');
    txt.innerText = msg;
    card.classList.remove('hidden');
}

// Apply Logout state
function applyLogoutState() {
    isLoggedIn = false;
    userRole = null;
    userAccountNo = null;
    userRecord = null;
    
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('user_account');
    
    const body = document.body;
    body.classList.remove('logged-in', 'role-analyst', 'role-customer');
    body.classList.add('logged-out');
    
    // Clear forms
    document.getElementById('login-form').reset();
    document.getElementById('login-error-msg').classList.add('hidden');
}

// Customer Eligibility Checker
async function handleCustomerEligibilitySubmit(e) {
    e.preventDefault();
    const form = document.getElementById('cust-elig-form');
    const formData = new FormData(form);
    
    const payload = {
        Gender: formData.get('Gender'),
        Married: formData.get('Married'),
        Dependents: formData.get('Dependents'),
        Education: formData.get('Education'),
        Self_Employed: formData.get('Self_Employed'),
        ApplicantIncome: parseFloat(formData.get('ApplicantIncome')),
        CoapplicantIncome: parseFloat(formData.get('CoapplicantIncome')),
        LoanAmount: parseFloat(formData.get('LoanAmount')),
        Loan_Amount_Term: parseFloat(formData.get('Loan_Amount_Term')),
        Credit_History: parseFloat(formData.get('Credit_History')),
        Property_Area: formData.get('Property_Area'),
        PURPOSE: formData.get('PURPOSE')
    };

    const resultsPanel = document.getElementById('cust-elig-results-panel');
    const emptyState = resultsPanel.querySelector('.results-empty-state');
    const activeState = resultsPanel.querySelector('.results-active-state');
    
    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');
    resultsPanel.classList.remove('empty');
    
    let result = null;
    
    if (isBackendOnline) {
        try {
            const res = await fetch(`${API_BASE_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                result = await res.json();
            } else {
                throw new Error("Prediction API Error");
            }
        } catch (err) {
            console.error("Backend prediction failed. Falling back to local.", err);
            result = calculateLocalRisk(payload);
        }
    } else {
        result = calculateLocalRisk(payload);
    }
    
    // Update Results UI
    const probPct = Math.round(result.probability * 100);
    document.getElementById('cust-elig-probability-pct').innerText = `${probPct}%`;
    
    // Update Gauge
    const fill = document.getElementById('cust-elig-gauge-fill');
    const strokeDash = 126;
    const offset = strokeDash - (result.probability * strokeDash);
    fill.style.strokeDashoffset = offset;
    
    if (result.probability > 0.45) {
        fill.style.stroke = 'var(--color-danger)';
    } else if (result.probability > 0.18) {
        fill.style.stroke = 'var(--color-warning)';
    } else {
        fill.style.stroke = 'var(--color-success)';
    }
    
    const badge = document.getElementById('cust-elig-grade-badge');
    badge.innerText = result.risk_grade.toUpperCase();
    badge.className = 'badge ' + result.risk_grade.split(' ')[0].toLowerCase();
    
    const decision = document.getElementById('cust-elig-decision-text');
    if (result.approved) {
        decision.innerText = 'APPROVED';
        decision.className = 'status-msg text-approved';
    } else {
        decision.innerText = 'REJECTED';
        decision.className = 'status-msg text-rejected';
    }
    
    const list = document.getElementById('cust-elig-recommendation-list');
    list.innerHTML = '';
    result.recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.innerText = rec;
        list.appendChild(li);
    });
}


// Tab Navigation Logic
function setupTabs() {
    const navButtons = document.querySelectorAll('.nav-btn[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            if (tabId === 'portfolio') {
                loadPortfolioAnalytics();
            }
        });
    });
}

// Client Side Scoring Engine (Local Fallback for Excel Schema)
function calculateLocalRisk(data) {
    const ch = parseFloat(data.Credit_History);
    const annual_income = (data.ApplicantIncome + data.CoapplicantIncome) * 12;
    const lti = (data.LoanAmount * 1000) / Math.max(1000, annual_income);
    
    // Default risk approximation formula mimicking RF classifier
    let logit = 0.5 - (3.6 * ch) + (4.2 * lti);
    if (data.Education === 'Not Graduate') logit += 0.55;
    if (data.Self_Employed === 'Yes') logit += 0.35;
    if (data.Property_Area === 'Rural') logit += 0.2; // Rural has slightly higher defaults in classic dataset
    
    const prob = 1.0 / (1.0 + Math.exp(-logit));
    const probability = Math.max(0.01, Math.min(0.99, prob));
    
    let risk_grade = "Low Risk";
    if (probability > 0.45) risk_grade = "High Risk";
    else if (probability > 0.18) risk_grade = "Medium Risk";
    
    const approved = ch === 1.0 && probability < 0.40;
    
    const recommendations = [];
    if (approved) {
        recommendations.push("Loan approved based on strong local credit analysis.");
        if (data.ApplicantIncome < 3000) {
            recommendations.push("Recommend lower credit limit range due to modest applicant monthly income.");
        }
    } else {
        recommendations.push("Loan rejected due to elevated risk metrics.");
        if (ch === 0.0) {
            recommendations.push("Applicant has no clear credit history (Credit_History = 0). This is the highest risk indicator.");
        }
        if (probability >= 0.40) {
            recommendations.push("Calculated probability of credit default exceeds standard risk threshold.");
        }
    }
    
    if (data.CoapplicantIncome === 0.0 && !approved) {
        recommendations.push("Adding a co-applicant with regular income could lower default risk assessment.");
    }
    if (lti > 0.40) {
        recommendations.push("Requested loan amount is high relative to income. Consider a smaller principal request.");
    }

    return { probability, risk_grade, approved, recommendations };
}

// Animate Gauge SVG
function updateGauge(prob) {
    const circle = document.getElementById('results-gauge-fill');
    const strokeDash = 126;
    const offset = strokeDash - (prob * strokeDash);
    circle.style.strokeDashoffset = offset;
    
    // Update color depending on probability
    if (prob > 0.45) {
        circle.style.stroke = 'var(--color-danger)';
    } else if (prob > 0.18) {
        circle.style.stroke = 'var(--color-warning)';
    } else {
        circle.style.stroke = 'var(--color-success)';
    }
}

// Evaluate Form submission
async function handleEvaluateSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('risk-form');
    const formData = new FormData(form);
    
    const payload = {
        Gender: formData.get('Gender'),
        Married: formData.get('Married'),
        Dependents: formData.get('Dependents'),
        Education: formData.get('Education'),
        Self_Employed: formData.get('Self_Employed'),
        ApplicantIncome: parseFloat(formData.get('ApplicantIncome')),
        CoapplicantIncome: parseFloat(formData.get('CoapplicantIncome')),
        LoanAmount: parseFloat(formData.get('LoanAmount')),
        Loan_Amount_Term: parseFloat(formData.get('Loan_Amount_Term')),
        Credit_History: parseFloat(formData.get('Credit_History')),
        Property_Area: formData.get('Property_Area'),
        PURPOSE: formData.get('PURPOSE')
    };

    const resultsPanel = document.getElementById('results-panel');
    const emptyState = resultsPanel.querySelector('.results-empty-state');
    const activeState = resultsPanel.querySelector('.results-active-state');
    
    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');
    resultsPanel.classList.remove('empty');
    
    let result = null;
    
    if (isBackendOnline) {
        try {
            const res = await fetch(`${API_BASE_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                result = await res.json();
            } else {
                throw new Error("Prediction API Error");
            }
        } catch (err) {
            console.error("Backend prediction failed. Falling back to local.", err);
            result = calculateLocalRisk(payload);
        }
    } else {
        result = calculateLocalRisk(payload);
        
        // Add to local mock portfolio list
        portfolioData.push({
            gender: payload.Gender,
            married: payload.Married,
            dependents: payload.Dependents,
            education: payload.Education,
            self_employed: payload.Self_Employed,
            applicant_income: payload.ApplicantIncome,
            coapplicant_income: payload.CoapplicantIncome,
            amount: payload.LoanAmount * 1000.0,
            term: payload.Loan_Amount_Term,
            credit_history: parseInt(payload.Credit_History),
            property_area: payload.Property_Area,
            purpose: payload.PURPOSE,
            probability: result.probability,
            risk_grade: result.risk_grade.split(' ')[0],
            approved: result.approved
        });
    }
    
    // Update Results UI
    const probPct = Math.round(result.probability * 100);
    document.getElementById('results-probability-pct').innerText = `${probPct}%`;
    updateGauge(result.probability);
    
    const badge = document.getElementById('results-grade-badge');
    badge.innerText = result.risk_grade.toUpperCase();
    badge.className = 'badge ' + result.risk_grade.split(' ')[0].toLowerCase();
    
    const decision = document.getElementById('results-decision-text');
    if (result.approved) {
        decision.innerText = 'APPROVED';
        decision.className = 'status-msg text-approved';
    } else {
        decision.innerText = 'REJECTED';
        decision.className = 'status-msg text-rejected';
    }
    
    const list = document.getElementById('results-recommendation-list');
    list.innerHTML = '';
    result.recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.innerText = rec;
        list.appendChild(li);
    });
}

// Portfolio Analytics Tab Logic
async function loadPortfolioAnalytics() {
    let metrics = {};
    
    if (isBackendOnline) {
        try {
            const res = await fetch(`${API_BASE_URL}/metrics`);
            if (res.ok) {
                metrics = await res.json();
            } else {
                throw new Error("Metrics API Error");
            }
        } catch (e) {
            console.error("Failed to fetch metrics from API. Using local metrics.", e);
            metrics = computeLocalMetrics();
        }
    } else {
        metrics = computeLocalMetrics();
    }
    
    // Populate KPI Cards
    document.getElementById('kpi-total-apps').innerText = metrics.total_applications;
    document.getElementById('kpi-acceptance-rate').innerText = `${Math.round(metrics.acceptance_rate * 100)}%`;
    document.getElementById('kpi-avg-risk').innerText = `${Math.round(metrics.average_risk * 100)}%`;
    document.getElementById('kpi-avg-loan').innerText = `$${Math.round(metrics.average_loan_amount).toLocaleString()}`;
    
    // Update or Create Charts
    renderCharts(metrics);
}

// Compute Metrics locally for fallback
function computeLocalMetrics() {
    if (portfolioData.length === 0) initFallbackPortfolio();
    
    const total = portfolioData.length;
    const approvedCount = portfolioData.filter(d => d.approved).length;
    const avgRisk = portfolioData.reduce((acc, curr) => acc + curr.probability, 0) / total;
    const avgLoan = portfolioData.reduce((acc, curr) => acc + curr.amount, 0) / total;
    
    const lowCount = portfolioData.filter(d => d.risk_grade === "Low").length;
    const medCount = portfolioData.filter(d => d.risk_grade === "Medium").length;
    const highCount = portfolioData.filter(d => d.risk_grade === "High").length;
    
    return {
        total_applications: total,
        acceptance_rate: approvedCount / total,
        average_risk: avgRisk,
        average_loan_amount: avgLoan,
        risk_distribution: { Low: lowCount, Medium: medCount, High: highCount },
        feature_importances: {
            "Credit_History": 0.40,
            "PURPOSE": 0.11,
            "ApplicantIncome": 0.09,
            "LoanAmount": 0.08,
            "CoapplicantIncome": 0.08,
            "Property_Area": 0.06,
            "Married": 0.04,
            "Dependents": 0.04,
            "Loan_Amount_Term": 0.04,
            "Education": 0.03,
            "Gender": 0.02,
            "Self_Employed": 0.02
        }
    };
}

// Render Chart.js graphs
function renderCharts(metrics) {
    // 1. Risk Distribution Doughnut Chart
    const ctxRisk = document.getElementById('riskDistributionChart').getContext('2d');
    if (riskChart) riskChart.destroy();
    
    riskChart = new Chart(ctxRisk, {
        type: 'doughnut',
        data: {
            labels: ['Low Risk', 'Medium Risk', 'High Risk'],
            datasets: [{
                data: [
                    metrics.risk_distribution.Low,
                    metrics.risk_distribution.Medium,
                    metrics.risk_distribution.High
                ],
                backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
                borderColor: '#161c2d',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#F3F4F6', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });

    // 2. Feature Importances Horizontal Bar Chart
    const ctxFeature = document.getElementById('featureImportanceChart').getContext('2d');
    if (featureChart) featureChart.destroy();
    
    const sortedFeatures = Object.entries(metrics.feature_importances)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
        
    const labels = sortedFeatures.map(item => item[0]);
    const values = sortedFeatures.map(item => item[1] * 100);
    
    featureChart = new Chart(ctxFeature, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Relative Importance (%)',
                data: values,
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: '#10B981',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9CA3AF', font: { family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#F3F4F6', font: { family: 'Inter', weight: 600 } }
                }
            }
        }
    });
}

// What-If Simulator Logic for Excel Columns
function setupSimulator() {
    const controls = ['sim-income', 'sim-coincome', 'sim-amount', 'sim-term', 'sim-education', 'sim-credit-history'];
    
    const runSimulation = () => {
        const income = parseInt(document.getElementById('sim-income').value);
        const coinc = parseInt(document.getElementById('sim-coincome').value);
        const amount = parseInt(document.getElementById('sim-amount').value);
        const term = parseInt(document.getElementById('sim-term').value);
        const ch = document.getElementById('sim-credit-history').checked ? 1 : 0;
        const edu = document.getElementById('sim-education').value;
        
        // Update slider values labels
        document.getElementById('sim-income-val').innerText = income.toLocaleString();
        document.getElementById('sim-coincome-val').innerText = coinc.toLocaleString();
        document.getElementById('sim-amount-val').innerText = amount.toLocaleString();
        document.getElementById('sim-term-val').innerText = term;
        
        // Calculate probability
        const annual_income = (income + coinc) * 12;
        const lti = (amount * 1000) / Math.max(1000, annual_income);
        
        let logit = 0.5 - (3.5 * ch) + (4.0 * lti);
        if (edu === 'Not Graduate') logit += 0.5;
        
        const prob = 1.0 / (1.0 + Math.exp(-logit));
        const probability = Math.max(0.01, Math.min(0.99, prob));
        
        const probPct = (probability * 100).toFixed(1);
        document.getElementById('sim-prob-display').innerText = `${probPct}%`;
        
        // UI updates
        const circle = document.getElementById('sim-circle');
        const categoryVal = document.getElementById('sim-category-display');
        const decisionVal = document.getElementById('sim-decision-display');
        
        let apr = 5.25;
        let riskCategory = "LOW RISK";
        let decision = "APPROVE";
        
        if (probability > 0.45) {
            circle.style.borderColor = 'var(--color-danger)';
            circle.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.25)';
            riskCategory = "HIGH RISK";
            decision = "DECLINE";
            categoryVal.className = 'sim-stat-val text-red';
            decisionVal.className = 'sim-stat-val text-red';
            apr = 17.50;
        } else if (probability > 0.18) {
            circle.style.borderColor = 'var(--color-warning)';
            circle.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.25)';
            riskCategory = "MEDIUM RISK";
            decision = ch === 1 ? "REVIEW" : "DECLINE";
            categoryVal.className = 'sim-stat-val text-amber';
            decisionVal.className = `sim-stat-val ${decision === "REVIEW" ? 'text-amber' : 'text-red'}`;
            apr = 10.75;
        } else {
            circle.style.borderColor = 'var(--color-success)';
            circle.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.25)';
            riskCategory = "LOW RISK";
            decision = "APPROVE";
            categoryVal.className = 'sim-stat-val text-green';
            decisionVal.className = 'sim-stat-val text-green';
            apr = 4.0 + (lti * 3.0);
        }
        
        categoryVal.innerText = riskCategory;
        decisionVal.innerText = decision;
        document.getElementById('sim-apr-display').innerText = `${apr.toFixed(2)}%`;
        
        // Calculate contribution indicators for progress bars
        // Credit factor
        const creditContrib = (1.0 - ch) * 80 + 10;
        // Leverage factor
        const leverageContrib = lti * 15 * 10;
        // Stability / Edu factor
        const stabilityContrib = (edu === 'Not Graduate' ? 45 : 15);
        
        updateBar('contrib-credit', Math.min(100, creditContrib));
        updateBar('contrib-leverage', Math.min(100, leverageContrib));
        updateBar('contrib-stability', Math.min(100, stabilityContrib));
    };
    
    const updateBar = (id, percent) => {
        const bar = document.getElementById(`${id}-bar`);
        const label = document.getElementById(`${id}-val`);
        
        bar.style.width = `${percent}%`;
        
        if (percent > 60) {
            bar.className = 'progress-bar-fill red';
            label.innerText = 'High Risk Impact';
        } else if (percent > 25) {
            bar.className = 'progress-bar-fill yellow';
            label.innerText = 'Medium Risk Impact';
        } else {
            bar.className = 'progress-bar-fill green';
            label.innerText = 'Low Risk Impact';
        }
    };

    // Attach listeners
    controls.forEach(id => {
        document.getElementById(id).addEventListener('input', runSimulation);
        document.getElementById(id).addEventListener('change', runSimulation);
    });
    
    // Initial run
    runSimulation();
}

// App Bootstrap
window.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize local fallback portfolio first
    initFallbackPortfolio();
    
    // 2. Perform connection checks
    checkBackendConnection();
    
    // 3. Setup core tab and slider simulator listeners
    setupTabs();
    setupSimulator();
    
    // 4. Verify login session
    checkSession();
    
    // 5. Register form submit events
    document.getElementById('risk-form').addEventListener('submit', handleEvaluateSubmit);
    document.getElementById('cust-elig-form').addEventListener('submit', handleCustomerEligibilitySubmit);
    
    // 6. Login Form submit handler
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const accountNo = document.getElementById('login-account').value;
        const pin = document.getElementById('login-pin').value;
        await performLogin(accountNo, pin);
    });
    
    // 7. Sign Out button click handler
    document.getElementById('logout-btn').addEventListener('click', () => {
        applyLogoutState();
    });
    
    // 8. Demo Shortcut Quick-Login buttons
    document.getElementById('demo-analyst-btn').addEventListener('click', async () => {
        document.getElementById('login-account').value = 'ANALYST';
        document.getElementById('login-pin').value = 'admin';
        await performLogin('ANALYST', 'admin');
    });
    
    document.getElementById('demo-customer-btn').addEventListener('click', async () => {
        document.getElementById('login-account').value = 'LP001003';
        document.getElementById('login-pin').value = '1234';
        await performLogin('LP001003', '1234');
    });
    
    // Re-verify connection periodically
    setInterval(checkBackendConnection, 10000);
});
