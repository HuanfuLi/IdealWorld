# [LEGACY] Ideal World - The Society Simulator

> **This README is legacy documentation from the original project concept. The project has been redesigned as a multi-agent society simulation platform. Please refer to the following documents for the current design:**
>
> - **[USER_FLOW.md](./USER_FLOW.md)** — Complete user flow and interaction design
> - **[PROJECT_DESIGN.md](./PROJECT_DESIGN.md)** — Full technical architecture and project design
>
> *The content below is preserved for historical reference only.*

---

**Ideal World** is a computational social science project. It combines Computer Science and Political Science to model historical dynamics and simulate potential futures.

The goal of this system is to collect high-quality historical records, quantify human behavior into data points, and use this data to predict future societal states. We use a combination of Time Series Analysis, Reinforcement Learning, and Retrieval-Augmented Generation (RAG).

## Project Overview

We are building a system that turns history into math. By analyzing what happened in the past, we attempt to calculate the probability of what might happen next.

The core idea follows this process:

1. **Input:** We feed the system reliable historical texts and documents.
2. **Quantification:** The system converts these texts into numerical state vectors. These vectors represent the status of a society at a specific time (e.g., economy, stability, diplomacy).
3. **Prediction:** We train a model to understand how these numbers change over time.
4. **Simulation:** We use Monte Carlo methods to simulate thousands of possible future paths and find the most likely outcomes.

## System Architecture

The project consists of four main modules.

### 1. Data Processing (RAG & Quantification)

This module builds the dataset. It uses Large Language Models (LLMs) to read historical documents. The LLM extracts key information and converts it into a structured time series format.

* **Input:** Historical archives, government papers, news records.
* **Output:** A multi-dimensional vector representing the state of the world at time .

### 2. The World Model (Time Series Prediction)

This module learns the rules of history. It analyzes the sequence of state vectors to understand cause and effect. We use deep learning models (like Transformers or LSTMs) to predict the state at time  based on previous states.

### 3. Agent Simulation (Reinforcement Learning)

This module introduces decision-making. We use AI agents to represent different political actors or social groups. These agents make decisions based on the current state of the world and their specific goals.

### 4. Outcome Search (Monte Carlo Method)

This module explores the future. It runs many simulations from a specific point in time. By aggregating the results, we can determine the statistical probability of different historical outcomes.

## Current Status and Roadmap

This project is currently in the early design and prototyping phase. We are an undergraduate team exploring how to implement these complex ideas.

**Phase 1: Data Pipeline (In Progress)**

* Select a specific historical period for testing.
* Build the RAG system to retrieve documents.
* Design the prompt engineering to convert text into consistent numbers.

**Phase 2: Model Training**

* Train the time series model on the generated data.
* Validate the model by trying to predict known historical events.

**Phase 3: Simulation Interface**

* Implement the Monte Carlo search.
* Create a simple visualization to show the branching paths of history.

## Challenges

We anticipate several technical difficulties as we build this:

* **Data Quality:** It is difficult to get consistent numbers from old texts.
* **Complexity:** Real human society has too many variables to model perfectly.
* **Computation:** Running thousands of simulations requires significant processing power.

We are treating this as an experiment. We will adjust our methods as we learn more.

## Tech Stack

* **Language:** Python
* **AI/ML:** PyTorch, Hugging Face (Transformers)
* **Data Handling:** Pandas, NumPy, Vector Database (for RAG)
* **Simulation:** Custom Monte Carlo implementation

## Contact

This project is maintained by Huanfu Li. Any feedback and suggestions on the architecture are welcomed.