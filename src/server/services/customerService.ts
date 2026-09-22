/**
 * AUTOVAULT — Customer Domain Service
 * 
 * Orchestrates customer profiles, activity auditing, and view-derived financial balances
 * (view_customer_debt_balances and view_customer_credit_balances).
 */

import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { customerRepository } from "../repositories/customerRepository";
import { 
  ValidationError, 
  EntityNotFoundError 
} from "../errors/domainErrors";
import { 
  NewCustomerInput, 
  UpdateCustomerInput, 
  CustomerFilter, 
  PaginationParams, 
  CustomerProfileSummary 
} from "./types";
import { Customer } from "../../types";

export const customerService = {
  /**
   * Creates a new customer profile.
   */
  async createCustomer(
    data: NewCustomerInput,
    client: DbClient = pool
  ): Promise<Customer> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("Customer name is required");
    }

    // Check if phone already registered if provided
    if (data.phone && data.phone.trim().length > 0) {
      const existing = await customerRepository.findByPhone(data.phone.trim(), client);
      if (existing) {
        throw new ValidationError(`Customer with phone number "${data.phone}" already exists`);
      }
    }

    return customerRepository.create(data, client);
  },

  /**
   * Updates an existing customer profile.
   */
  async updateCustomer(
    id: string,
    data: UpdateCustomerInput,
    client: DbClient = pool
  ): Promise<Customer> {
    const existing = await customerRepository.findById(id, client);
    if (!existing) {
      throw new EntityNotFoundError("Customer", id);
    }

    if (data.phone && data.phone.trim().length > 0 && data.phone !== existing.phone) {
      const conflict = await customerRepository.findByPhone(data.phone.trim(), client);
      if (conflict && conflict.id !== id) {
        throw new ValidationError(`Phone number "${data.phone}" is already associated with another customer`);
      }
    }

    return customerRepository.update(id, data, client);
  },

  /**
   * Fetches customer profile with dynamic derived balances:
   * debt from view_customer_debt_balances and storeCredit from view_customer_credit_balances.
   */
  async getCustomerProfile(
    id: string,
    client: DbClient = pool
  ): Promise<CustomerProfileSummary> {
    const customer = await customerRepository.findById(id, client);
    if (!customer) {
      throw new EntityNotFoundError("Customer", id);
    }

    const [debt, storeCredit, activities] = await Promise.all([
      customerRepository.getDebtBalance(id, client),
      customerRepository.getCreditBalance(id, client),
      customerRepository.getActivities(id, 20, client)
    ]);

    return {
      ...customer,
      debt,
      storeCredit,
      activities
    };
  },

  /**
   * Lists customers with search and pagination.
   */
  async listCustomers(
    filter: CustomerFilter = {},
    pagination: PaginationParams = {},
    client: DbClient = pool
  ): Promise<{ data: Customer[]; total: number }> {
    return customerRepository.list(filter, pagination, client);
  }
};
