import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";

export const numberingRepository = {
  /**
   * Generates the next invoice number using atomic PostgreSQL function.
   */
  async getNextInvoiceNumber(
    prefix: string,
    year: number,
    client: DbClient = pool
  ): Promise<string> {
    const res = await client.query(
      `SELECT get_next_invoice_number($1, $2) as num`,
      [prefix, year]
    );
    return res.rows[0].num;
  },

  /**
   * Generates the next PO number using atomic PostgreSQL function.
   */
  async getNextPoNumber(
    year: number,
    client: DbClient = pool
  ): Promise<string> {
    const res = await client.query(
      `SELECT get_next_po_number($1) as num`,
      [year]
    );
    return res.rows[0].num;
  },

  /**
   * Generates the next Sales Return number using atomic PostgreSQL function.
   */
  async getNextSalesReturnNumber(
    year: number,
    client: DbClient = pool
  ): Promise<string> {
    const res = await client.query(
      `SELECT get_next_sales_return_number($1) as num`,
      [year]
    );
    return res.rows[0].num;
  },

  /**
   * Generates the next Payment Receipt number using atomic PostgreSQL sequence.
   */
  async getNextPaymentReceiptNumber(
    client: DbClient = pool
  ): Promise<string> {
    const res = await client.query(
      `SELECT get_next_payment_receipt_number() as num`
    );
    return res.rows[0].num;
  }
};
