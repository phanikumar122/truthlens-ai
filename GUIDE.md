# 🛡️ TruthLens AI: The Beginner's Guide

Welcome! You are about to run a state-of-the-art **Fake News Detection System**. Don't worry if you've never used AI or coding tools before—this guide will walk you through every step.

---

## 🌟 What is TruthLens AI?

Think of TruthLens AI as a **"Digital Fact-Checker"** that never sleeps. It reads news headlines, checks them against a library of known facts, and tells you if they are likely to be true or false.

### 🧩 The Simple Terms Dictionary
If you're new to this, here is what these words mean in our project:
-   **Backend**: The "Brain" of the app. It's where the AI lives and does the thinking.
-   **Frontend**: The "Face" of the app. It's the beautiful dashboard you see in your browser.
-   **API Key**: A "Secret Passcode" used to get live news from the internet.
-   **Mock Data**: "Practice News" built into the app so you can see it working without needing a passcode.
-   **WebSocket**: A "Live Phone Call" between the Brain and the Face so updates happen instantly.

---

## 🚀 How to Get Started

Follow these **3 Simple Phases** to get the system running.

### 🚩 Phase 1: Preparation
Make sure you have these two "Engines" installed on your computer:
1.  **Python**: (The Brain's Engine) Install from [python.org](https://www.python.org/).
2.  **Node.js**: (The Face's Engine) Install from [nodejs.org](https://nodejs.org/).

---

### 🧠 Phase 2: Starting the "Brain" (Backend)
The Brain needs to load its AI models before it can start checking news.

1.  **Open your terminal/command prompt.**
2.  **Go into the backend folder**:
    ```bash
    cd backend
    ```
3.  **Install the "Ingredients"**: (This tells Python what tools it needs)
    ```bash
    pip install -r requirements.txt
    ```
4.  **Wake up the Brain**:
    ```bash
    python -m uvicorn main:app --reload
    ```
    > [!IMPORTANT]
    > **The First Run is Slow**: The Brain will download about 500MB of AI models the first time you start it. This is normal! Once you see `Application startup complete`, the Brain is ready.

---

### 💻 Phase 3: Starting the "Dashboard" (Frontend)
Now we need to start the interface so you can see the results.

1.  **Open a NEW terminal window** (don't close the Brain window!).
2.  **Go into the frontend folder**:
    ```bash
    cd frontend
    ```
3.  **Install the "Interface Tools"**:
    ```bash
    npm install
    ```
4.  **Launch the Dashboard**:
    ```bash
    npm run dev
    ```
5.  **See the Magic**: Open your browser and go to: **[http://localhost:3000](http://localhost:3000)**

---

## 🕵️ How the AI Works (The "Is it True?" Test)

When the Brain sees a headline, it does three things:
1.  **Linguistic Check**: Does this sound like "clickbait" or aggressive fake news?
2.  **Fact Check**: Does this headline contradict our library of known facts? (e.g., If the news says "Gold is found in sandboxes," the AI checks if that's scientifically likely).
3.  **Source Check**: Is the headline coming from a trusted news agency like Reuters or a mysterious mock source?

The AI then combines these three answers into one **Risk Level**:
-   🟢 **Low Risk**: Likely true.
-   🟡 **Moderate**: Could be biased or unverified.
-   🔴 **High Risk**: Contradicts known facts.

---

## 🛠️ "What if it doesn't work?" (Simple Fixes)

-   **"My Dashboard is empty!"**: Make sure the Brain (Backend) terminal is still running. If the Brain stops, the heart of the app stops.
-   **"I see 401 Unauthorized errors"**: Don't worry! This just means you haven't added a "Secret Passcode" (API Key) yet. The system will automatically switch to **Mock Mode** using practice news so you can still use it.
-   **"The text is too fast!"**: The dashboard updates every few seconds. You can click on any news item on the left to "Pause" and read the detailed report on the right.

---

## 📈 Next Steps for You

Ready to become a pro?
-   **Add your own facts**: You can actually teach the AI new facts! Open `backend/ai_engine.py` and look for the `FACT_DATABASE` list. Add anything you want!
-   **Get Live News**: Sign up for a free key at [newsapi.org](https://newsapi.org/) and paste it into the `backend/.env` file.

**You're all set! Enjoy exploring the world of AI with TruthLens.**
