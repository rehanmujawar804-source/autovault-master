import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { ShopSettings } from "./types";

export const shopSettingsRepository = {
  /**
   * Gets the singleton shop settings.
   */
  async getSettings(client: DbClient = pool): Promise<ShopSettings> {
    const res = await client.query(
      `SELECT * FROM shop_settings WHERE id = 'singleton'`
    );
    if (res.rows.length === 0) {
      throw new Error("Shop settings singleton missing");
    }
    return this.mapRowToShopSettings(res.rows[0]);
  },

  /**
   * Updates the shop settings.
   */
  async updateSettings(
    updates: Partial<ShopSettings>,
    client: DbClient = pool
  ): Promise<ShopSettings> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const addField = (colName: string, value: any) => {
      if (value !== undefined) {
        fields.push(`${colName} = $${paramIndex++}`);
        params.push(value);
      }
    };

    addField("shop_name", updates.shopName);
    addField("owner_name", updates.ownerName);
    addField("phone", updates.phone);
    addField("email", updates.email);
    addField("address", updates.address);
    addField("gst_number", updates.gstNumber);
    addField("invoice_prefix", updates.invoicePrefix);
    addField("currency", updates.currency);
    addField("show_logo", updates.showLogo);
    addField("show_gst", updates.showGST);
    addField("show_address", updates.showAddress);
    addField("show_phone", updates.showPhone);
    addField("footer_message", updates.footerMessage);
    addField("theme", updates.theme);

    if (fields.length === 0) {
      return this.getSettings(client);
    }

    fields.push(`updated_at = NOW()`);

    const res = await client.query(
      `UPDATE shop_settings SET ${fields.join(", ")} WHERE id = 'singleton' RETURNING *`,
      params
    );
    
    return this.mapRowToShopSettings(res.rows[0]);
  },

  mapRowToShopSettings(row: any): ShopSettings {
    return {
      id: row.id,
      shopName: row.shop_name,
      ownerName: row.owner_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      gstNumber: row.gst_number,
      invoicePrefix: row.invoice_prefix,
      currency: row.currency,
      showLogo: row.show_logo,
      showGST: row.show_gst,
      showAddress: row.show_address,
      showPhone: row.show_phone,
      footerMessage: row.footer_message,
      theme: row.theme,
      updatedAt: row.updated_at.toISOString()
    };
  }
};
