
/*
  Where Did My Money Go?
  Frontend logic and Flask API connection.

  For local testing, run app.py and use this address.
  When deployed, replace it with your hosted backend URL.
*/
const API_BASE = "https://backend-wheredidmoneygo.onrender.com";

const $ = (id) => document.getElementById(id);

const COLORS = [
  "#bd7898", "#91b69b", "#e6bf79", "#a99acb",
  "#d99588", "#83b8c2", "#c7a3b6", "#a9a39a"
];

let noticeTimer;

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function selectedMonth() {
  return $("monthFilter").value;
}

function showNotice(message, type = "success") {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice show ${type}`;

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.className = "notice";
  }, 4000);
}

async function api(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error(
      "Cannot reach the backend. Make sure Flask is running and the API address is correct."
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Something went wrong.");
  }

  return result;
}

async function loadDashboard() {
  try {
    await Promise.all([
      loadSummary(),
      loadExpenses(),
      loadSettings()
    ]);
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function loadSummary() {
  const month = encodeURIComponent(selectedMonth());
  const data = await api(`/api/summary?month=${month}`);

  $("totalSpent").textContent = money(data.total_spent);

  if (Number(data.monthly_budget) > 0) {
    $("budgetRemaining").textContent = money(data.budget_remaining);
    $("budgetCaption").textContent =
      data.budget_remaining < 0
        ? "You've gone over your budget"
        : "Still available in your budget";

    const usedPercent = Math.min(
      100,
      (data.total_spent / data.monthly_budget) * 100
    );

    $("budgetProgress").style.width = `${usedPercent}%`;
  } else {
    $("budgetRemaining").textContent = "Not set";
    $("budgetCaption").textContent = "Set a monthly budget below";
    $("budgetProgress").style.width = "0%";
  }

  $("categoryChart").replaceChildren();

  if (!data.category_breakdown.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No expenses this month. Add one to see your breakdown ♡";
    $("categoryChart").append(empty);
    return;
  }

  data.category_breakdown.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "category-row";

    const label = document.createElement("div");
    label.className = "category-label";

    const categoryName = document.createElement("span");
    categoryName.textContent = item.category;

    const categoryAmount = document.createElement("strong");
    categoryAmount.textContent = money(item.total);

    label.append(categoryName, categoryAmount);

    const track = document.createElement("div");
    track.className = "category-track";

    const fill = document.createElement("div");
    fill.className = "category-fill";

    const percent = data.total_spent > 0
      ? (Number(item.total) / Number(data.total_spent)) * 100
      : 0;

    fill.style.width = `${percent}%`;
    fill.style.backgroundColor = COLORS[index % COLORS.length];

    track.append(fill);
    row.append(label, track);
    $("categoryChart").append(row);
  });
}

async function loadExpenses() {
  const month = encodeURIComponent(selectedMonth());
  const expenses = await api(`/api/expenses?month=${month}`);

  $("transactionCount").textContent =
    `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`;

  const list = $("expenseList");
  list.replaceChildren();

  if (!expenses.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty-state";
    td.textContent = "Your expenses will show up here ♡";
    tr.append(td);
    list.append(tr);
    return;
  }

  expenses.forEach((expense) => {
    const tr = document.createElement("tr");

    const title = document.createElement("td");
    title.textContent = expense.title;

    const categoryCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "category-pill";
    pill.textContent = expense.category;
    categoryCell.append(pill);

    const dateCell = document.createElement("td");
    dateCell.textContent = expense.expense_date;

    const amount = document.createElement("td");
    amount.className = "amount-cell";
    amount.textContent = `− ${money(expense.amount)}`;

    const action = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute(
      "aria-label",
      `Delete expense ${expense.title}`
    );

    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete "${expense.title}"?`)) return;

      deleteButton.disabled = true;

      try {
        await api(`/api/expenses/${expense.id}`, {
          method: "DELETE"
        });

        showNotice("Expense deleted successfully ♡");
        await loadDashboard();
      } catch (error) {
        showNotice(error.message, "error");
        deleteButton.disabled = false;
      }
    });

    action.append(deleteButton);
    tr.append(title, categoryCell, dateCell, amount, action);
    list.append(tr);
  });
}

async function loadSettings() {
  const settings = await api("/api/settings");

  $("monthlyBudget").value = settings.monthly_budget ?? 0;
  $("goalAmount").value = settings.savings_goal ?? 0;
  $("goalName").value = settings.savings_goal_name || "My savings goal";

  $("savingsGoal").textContent = money(settings.savings_goal);
  $("savingsCaption").textContent =
    settings.savings_goal_name || "Your goal starts here";

  // A target is not the same as money saved, so no savings progress
  // is shown until the app has a way to record actual savings.
  $("savingsProgress").style.width = "0%";
}

$("expenseForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("expenseForm").querySelector("button[type='submit']");
  button.disabled = true;

  const expense = {
    title: $("expenseTitle").value.trim(),
    amount: Number($("expenseAmount").value),
    category: $("expenseCategory").value,
    expense_date: $("expenseDate").value,
    note: $("expenseNote").value.trim()
  };

  try {
    await api("/api/expenses", {
      method: "POST",
      body: JSON.stringify(expense)
    });

    $("expenseForm").reset();
    $("expenseDate").value = new Date().toLocaleDateString("en-CA");
    showNotice("Expense saved! Every rupee has a story ♡");

    // If the expense belongs to another month, switch the dashboard
    // to that month so the new entry is visible.
    $("monthFilter").value = expense.expense_date.slice(0, 7);

    await loadDashboard();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("settingsForm").querySelector("button[type='submit']");
  button.disabled = true;

  const settings = {
    monthly_budget: Number($("monthlyBudget").value),
    savings_goal: Number($("goalAmount").value),
    savings_goal_name: $("goalName").value.trim() || "My savings goal"
  };

  if (
    settings.monthly_budget < 0 ||
    settings.savings_goal < 0 ||
    !Number.isFinite(settings.monthly_budget) ||
    !Number.isFinite(settings.savings_goal)
  ) {
    showNotice("Please enter valid, non-negative amounts.", "error");
    button.disabled = false;
    return;
  }

  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings)
    });

    showNotice("Your budget and savings goal have been saved ♡");
    await loadDashboard();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("monthFilter").addEventListener("change", async () => {
  try {
    await Promise.all([loadSummary(), loadExpenses()]);
  } catch (error) {
    showNotice(error.message, "error");
  }
});

// Set the initial month and date.
const today = new Date();
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

$("monthFilter").value = localDate.slice(0, 7);
$("expenseDate").value = localDate;

loadDashboard();
