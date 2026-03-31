# TruthLens AI Setup & Run Guide

Follow these steps to get the real-time misinformation detection system running on your local machine.

## 🚀 Prerequisites

*   Python 3.9+
*   Node.js 18+
*   NPM/PNPM

---

## 🛠️ Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure API Keys:**
    Update the `.env` file with your `NEWS_API_KEY`. If left as `your_dummy_key`, the system will use simulated data.

5.  **Run the FastAPI server:**
    ```bash
    uvicorn main:app --reload
    ```
    The server will be available at `http://localhost:8000`.

---

## 🎨 Frontend Setup

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The dashboard will be available at `http://localhost:3000`.

---

## 🔍 How it Works

*   **Data Ingestion**: Fetches live news from NewsAPI (or mocks it).
*   **AI Engine**: Uses RoBERTa for claim classification and Sentence-Transformers for semantic fact retrieval.
*   **Real-time**: WebSockets push new analysis directly to the dashboard every few seconds.
*   **UI**: Built with Next.js, Tailwind CSS, and Framer Motion for a premium, interactive experience.
