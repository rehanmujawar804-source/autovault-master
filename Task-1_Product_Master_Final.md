You are developing AutoVault.

This is the FINAL implementation of Product Master.

Think like a senior ERP architect.

Do not optimize for speed.
Optimize for long-term architecture.

====================================================
DO NOT TOUCH
====================================================

Do NOT modify:

- Billing
- Customers
- Analytics
- Invoices
- Suppliers
- Backend
- Database
- Mobile responsiveness

Only Product Master + Migration System.

====================================================
GOAL
====================================================

Build a production-grade Product Master.

This implementation will become the foundation for:

- Suppliers
- Purchases
- Inventory Movements
- Database
- Backend

No shortcuts.

====================================================
PRODUCT MASTER
====================================================

Each product contains ONLY:

- id
- name
- sku
- brand
- category
- status
- buyPrice
- sellPrice
- stock
- lowStockThreshold
- fitments
- createdAt
- updatedAt

DO NOT ADD

- openingStock
- warehouse
- shelf
- barcode
- gst
- hsn
- images
- expiry
- batch

====================================================
SKU RULES
====================================================

SKU must be unique.

SKU validation:

- required
- 3–40 characters
- alphanumeric
- hyphen allowed
- underscore allowed

Duplicate SKU must NEVER be allowed.

Editing Product:

SKU becomes read-only forever.

====================================================
STATUS
====================================================

Every product has:

Active

Inactive

Discontinued

Default:

Active

Products are NEVER deleted.

====================================================
VALIDATION
====================================================

Name

3–100 characters

Buy Price

>=0

Sell Price

>=0

If

Sell Price < Buy Price

Allow save

Show warning

NOT error

Stock

Integer

>=0

Threshold

Integer

>=1

====================================================
ID GENERATION
====================================================

Create ONE helper.

generateUniqueId(prefix)

Every entity must use it.

Never use

Date.now()

for IDs.

====================================================
MIGRATION SYSTEM
====================================================

Create a migration framework.

Migration Registry

Migration Runner

Applied Migration Tracker

Stored inside

localStorage

Migration IDs

m001

m002

m003

etc

====================================================
MIGRATION 001
====================================================

Repair existing data.

For every product:

If duplicate ID

Generate new ID.

If missing status

status = Active

If missing createdAt

populate

If missing updatedAt

populate

Save repaired state.

Migration must NEVER run twice.

====================================================
CSV IMPORT
====================================================

CSV imports Product Master only.

Rules:

Duplicate SKU

Reject

Invalid Status

Default Active

Generate safe IDs

Do NOT overwrite existing products automatically.

====================================================
DESKTOP UI
====================================================

Add Product

Edit Product

Status dropdown

Disabled SKU on edit

Better validation

Professional error messages

Nothing else.

====================================================
NOT ALLOWED
====================================================

Do NOT redesign Inventory Dashboard.

Do NOT redesign Product Details.

Do NOT implement Suppliers.

Do NOT implement Purchases.

Do NOT implement Inventory Movements.

Do NOT implement Backend.

Do NOT implement Database.

====================================================
TESTS
====================================================

Verify:

✓ Duplicate SKU rejected

✓ SKU immutable

✓ Status works

✓ Migration repairs duplicate IDs

✓ Migration runs only once

✓ IDs generated safely

✓ Existing functionality preserved

Run

npx tsc --noEmit

====================================================
OUTPUT
====================================================

Provide:

1. Root Cause
2. Files Modified
3. Why each file changed
4. Migration Explanation
5. Manual Testing Checklist

Stop after Task 1.

Do NOT continue to Task 2.