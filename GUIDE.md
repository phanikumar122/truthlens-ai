# TruthLens AI Setup & Run Guide

Follow these steps to get the real-time misinformation detection system running on your local machine.

## 🚀 Prerequisites

*   **Python 3.10+** (optimized for AI workloads)
*   **Node.js 20+**
*   **NPM / PNPM**

---

## 🛠️ Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment:**
    ```bash
    python -m venv venv
    .\venv\Scripts\activate  # Windows
    source venv/bin/activate # Unix/macOS
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure API Keys:**
    Update the `.env` file with your `NEWS_API_KEY`. If left as `your_dummy_key`, the system will use simulated data for testing.

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

*   **Premium Skeuomorphic UI**: Features a 4K-quality tactile design with realistic 3D shadows, metallic accents, and embossed/engraved typography for a high-end dashboard experience.
*   **Data Ingestion**: Fetches live news from NewsAPI (or mocks it for local development).
*   **AI Engine**: Hybrid pipeline using RoBERTa for claim classification and Sentence-Transformers for semantic fact retrieval.
*   **Real-time Analysis**: WebSockets push analysis results directly to the dashboard every few seconds.
*   **Tech Stack**: Built with **Next.js 15+**, **Tailwind CSS 4.0**, and **Framer Motion** for smooth, physically-accurate animations.
