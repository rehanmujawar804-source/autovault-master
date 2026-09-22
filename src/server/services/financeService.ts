/**
 * AUTOVAULT — Finance & Ledger Domain Service
 * 
 * Manages append-only accounting entries, method-to-account mapping,
 * business expense/income logging, account balance summaries, and reversal tracking.
 */

import { withTransaction, DbClient } from "../db/txRunner";
import { pool } from "../db/client";
import { financeRepository } from "../repositories/financeRepository";
import { 
  ValidationError, 
  EntityNotFoundError,
  CannotReverseReversalError,
  TransactionAlreadyReversedError
} from "../errors/domainErrors";
import { 
  RecordExpenseInput, 
  RecordIncomeInput, 
  FinanceFilter, 
  PaginationParams, 
  AccountBalanceSummary 
} from "./types";
import { FinanceTransaction } from "../../types";

/**
 * Maps payment method string to core finance account ID.
 */
export function methodToAccountId(method: string): string {
  switch (method) {
    case "UPI":
      return "acc-upi";
    case "Bank":
    case "Card":
      return "acc-bank";
    case "Cash":
    default:
      return "acc-cash";
  }
}

export const financeService = {
  /**
   * Retrieves all liquid accounts with their dynamic current balances.
   */
  async getAccounts(client: DbClient = pool): Promise<AccountBalanceSummary[]> {
    const accounts = await financeRepository.getAccounts(client);
    
    // Calculate live balances for each account from ledger
    const summaries: AccountBalanceSummary[] = [];
    for (const acc of accounts) {
      const balance = await financeRepository.getAccountBalance(acc.id, client);
      summaries.push({
        ...acc,
        currentBalance: balance
      });
    }
    return summaries;
  },

  /**
   * Records a manual business operating expense.
   */
  async recordBusinessExpense(
    input: RecordExpenseInput,
    client: DbClient = pool
  ): Promise<FinanceTransaction> {
    if (input.amount <= 0) {
      throw new ValidationError("Expense amount must be greater than zero");
    }
    if (!input.category || input.category.trim().length === 0) {
      throw new ValidationError("Expense category is required");
    }

    return financeRepository.createTransaction({
      accountId: input.accountId || methodToAccountId(input.method),
      type: "Expense",
      category: input.category as any,
      amount: input.amount,
      date: input.date || new Date().toISOString().split("T")[0],
      method: (input.method as any) || "Cash",
      notes: input.notes,
      referenceId: input.referenceId || "EXPENSE",
      referenceType: input.referenceType || "BusinessExpense"
    }, client);
  },

  /**
   * Records manual business money in / income.
   */
  async recordBusinessMoneyIn(
    input: RecordIncomeInput,
    client: DbClient = pool
  ): Promise<FinanceTransaction> {
    if (input.amount <= 0) {
      throw new ValidationError("Income amount must be greater than zero");
    }
    if (!input.category || input.category.trim().length === 0) {
      throw new ValidationError("Income category is required");
    }

    return financeRepository.createTransaction({
      accountId: input.accountId || methodToAccountId(input.method),
      type: "Income",
      category: input.category as any,
      amount: input.amount,
      date: input.date || new Date().toISOString().split("T")[0],
      method: (input.method as any) || "Cash",
      notes: input.notes,
      referenceId: input.referenceId || "INCOME",
      referenceType: input.referenceType || "BusinessExpense"
    }, client);
  },

  /**
   * Creates an immutable balancing reversal entry for an existing transaction.
   */
  async reverseTransaction(
    originalTxId: string,
    reason: string,
    existingClient?: DbClient
  ): Promise<FinanceTransaction> {
    const execute = async (txClient: DbClient) => {
      // Row-lock original transaction
      const tx = await financeRepository.getTransactionById(originalTxId, { forUpdate: true }, txClient);
      if (!tx) {
        throw new EntityNotFoundError("FinanceTransaction", originalTxId);
      }

      // Validate invariants
      if (tx.reversalOf) {
        throw new CannotReverseReversalError(originalTxId);
      }

      const existingReversal = await financeRepository.findReversalForTransaction(originalTxId, txClient);
      if (existingReversal) {
        throw new TransactionAlreadyReversedError(originalTxId);
      }

      const reversingType = tx.type === "Income" ? "Expense" : "Income";

      return financeRepository.createTransaction({
        accountId: tx.accountId,
        type: reversingType,
        category: tx.category,
        amount: tx.amount,
        date: new Date().toISOString().split("T")[0],
        method: tx.method,
        notes: `Reversal: ${reason} (Ref: ${originalTxId})`,
        referenceId: tx.referenceId,
        reversalOf: originalTxId,
        customerId: tx.customerId,
        supplierId: tx.supplierId
      }, txClient);
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return withTransaction(execute);
  },

  /**
   * Lists financial transactions with filtering and pagination.
   */
  async listTransactions(
    filter: FinanceFilter = {},
    pagination: PaginationParams = {},
    client: DbClient = pool
  ): Promise<{ data: FinanceTransaction[]; total: number }> {
    return financeRepository.listTransactions(filter, pagination, client);
  }
};
