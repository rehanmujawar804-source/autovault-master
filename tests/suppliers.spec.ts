import { test, expect } from '@playwright/test';

test.describe('AutoVault Suppliers Module — Enterprise Validation Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/suppliers');
    await page.evaluate(() => {
      localStorage.setItem('role', 'owner');
      localStorage.removeItem('autovault_store');
    });
    await page.reload();
    await page.locator('button[data-testid="add-supplier-btn"]').waitFor({ state: 'visible', timeout: 20000 });
  });

  test('Scenario 1: Name + Address + Phone creates supplier successfully', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Minda Industries Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Thane West');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Minda Industries Ltd.');
  });

  test('Scenario 2: Name + Address + Email creates supplier successfully', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Bosch India');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Bangalore Electronic City');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('sales@bosch.in');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Bosch India');
  });

  test('Scenario 3: Name + Address + Phone + Email creates supplier successfully', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Lumax Auto Technologies');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune MIDC');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9822012345');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('contact@lumax.com');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Lumax Auto Technologies');
  });

  test('Scenario 4: Name + Address without Phone/Email is blocked', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Uno Minda Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Gurgaon Sector 18');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('At least one contact method (Phone or Email) is required.');
  });

  test('Scenario 5: Name + Phone without Address is blocked', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Exide Industries');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9830012345');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier address is required.');
  });

  test('Scenario 6: Name + Email without Address (whitespace-only) is blocked', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Amaron Batteries');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('support@amaron.com');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('   ');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier address is required.');
  });

  test('Scenario 7: Optional fields empty is accepted', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('7 Star Accessories');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Mumbai Central');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9820011223');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('Scenario 8 & 9: Invalid Phone and Email are blocked', async ({ page }) => {
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Speed Auto');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Delhi');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('12345');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('invalid-email@');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Enter a valid 10-digit Indian mobile number.');
    await expect(page.locator('.fixed.inset-0')).toContainText('Enter a valid email address.');
  });

  test('Scenario 10, 11, 12, 13: Duplicate Name, Phone, Email, GST are blocked', async ({ page }) => {
    // Add first supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Minda Industries Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Thane');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('sales@minda.com');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('29ABCDE1234F1Z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Try adding duplicate name (case variation)
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('minda industries ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9811122233');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier with this name already exists.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate phone
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 1');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this phone number.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate email
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 2');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('SALES@MINDA.COM');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this email address.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate GST
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 3');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9844455566');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('29abcde1234f1z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this GSTIN.');
  });

  test('Scenario 14, 15, 16: Same Phone+WhatsApp allowed, Edit unchanged allowed, Edit duplicate blocked', async ({ page }) => {
    // Add Supplier A
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Supplier A');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Address A');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9899988877');
    await page.locator('.fixed input[placeholder="98765 43210"]').nth(1).fill('9899988877');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Add Supplier B
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Supplier B');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Address B');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9811122233');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Edit Supplier A without changes
    await page.locator('tbody tr button[title="Edit Supplier"]').first().click();
    await page.locator('.fixed button:has-text("Save Changes")').click();
    await expect(page.locator('.fixed.inset-0')).toHaveCount(0);

    // Edit Supplier A (row 2) to have Supplier B's name -> should block duplicate
    await page.locator('tbody tr button[title="Edit Supplier"]').nth(1).click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Supplier B');
    await page.locator('.fixed button:has-text("Save Changes")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier with this name already exists.');
  });

  test('Sprint 1: Actionable KPI Cards Filtering & Clear Filter', async ({ page }) => {
    // Add Active Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Active Vendor Alpha');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Alpha Lane 1');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9811001100');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Add Inactive Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Inactive Vendor Beta');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Beta Lane 2');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9822002200');
    await page.locator('.fixed select').last().selectOption('Inactive');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Verify 2 rows present
    await expect(page.locator('tbody tr')).toHaveCount(2);

    // Click Active Suppliers KPI Card
    await page.locator('button[data-kpi="active"]').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Active Vendor Alpha');

    // Verify Active Filter Banner
    await expect(page.locator('text=Active Filter:')).toBeVisible();

    // Clear Filter
    await page.locator('button:has-text("Clear Filter")').click();
    await expect(page.locator('tbody tr')).toHaveCount(2);

    // Click Total Suppliers KPI Card to reset
    await page.locator('button[data-kpi="all"]').click();
    await expect(page.locator('tbody tr')).toHaveCount(2);
  });

  test('Sprint 1: Advanced Search and Escape to Clear', async ({ page }) => {
    // Add Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Super Parts Ltd');
    await page.locator('.fixed input[placeholder*="Rajesh Kumar"]').fill('Suresh Raina');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Chennai Port Road');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9844004400');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('suresh@superparts.com');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('33AAAAA0000A1Z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    const searchInput = page.locator('input[placeholder*="Search suppliers"]');

    // Search by Name
    await searchInput.fill('Super Parts');
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // Search by Contact Person
    await searchInput.fill('Suresh');
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // Search by Phone
    await searchInput.fill('9844004400');
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // Search by GSTIN
    await searchInput.fill('33AAAAA0000A1Z5');
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // Clear search with Escape key
    await searchInput.press('Escape');
    await expect(searchInput).toHaveValue('');
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('Sprint 1: Row Quick-Action Menu (...), Copy Actions, and Direct Links', async ({ page }) => {
    // Add Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Quick Action Supplier');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Bangalore Peenya');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9870098700');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('quick@supplier.com');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Verify direct contact links exist
    await expect(page.locator('a[href="tel:9870098700"]').first()).toBeVisible();
    await expect(page.locator('a[href="mailto:quick@supplier.com"]').first()).toBeVisible();

    // Open Row Quick Action menu (...)
    const triggerBtn = page.locator('button[aria-label*="More actions"]').first();
    await triggerBtn.click();
    await expect(page.locator('[data-testid="floating-supplier-menu"]')).toBeVisible();
    await expect(page.locator('text=View Profile')).toBeVisible();
    await expect(page.locator('text=New Purchase Invoice')).toBeVisible();
    await expect(page.locator('text=Create Purchase Order')).toBeVisible();
    await expect(page.locator('text=Copy Supplier ID')).toBeVisible();

    // Trigger Edit from Quick Action Menu
    await page.locator('button:has-text("Edit Supplier")').click();
    await expect(page.locator('.fixed.inset-0 h2')).toContainText('Edit Supplier');
    await page.locator('.fixed button:has-text("Cancel")').click();
    await expect(page.locator('.fixed.inset-0')).toHaveCount(0);
  });

  test('Sprint 1: Mobile Touch-Friendly Card View & Responsive Viewports', async ({ page }) => {
    // Add Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Mobile Responsive Vendor');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Mumbai Andheri');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9810098100');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    const viewports = [
      { width: 320, height: 600 },
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      // Check no horizontal scrollbar on body
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(isOverflowing).toBe(false);

      if (vp.width < 768) {
        // Mobile cards should be visible
        await expect(page.locator('.md\\:hidden').first()).toBeVisible();
        await expect(page.locator('.md\\:hidden')).toContainText('Mobile Responsive Vendor');
      } else {
        // Desktop table should be visible
        await expect(page.locator('.hidden.md\\:block')).toBeVisible();
      }
    }
  });

  test('Sprint 2: Floating Portal Dropdown — Flipping, Non-Clipping, and Dismissal Mechanics', async ({ page }) => {
    // Add Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Portal Test Vendor');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune Hinjewadi');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9823001122');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    const triggerBtn = page.locator('tbody tr button[aria-label*="More actions"]').first();

    // 1. Open Floating Menu
    await triggerBtn.click();
    const floatingMenu = page.locator('[data-testid="floating-supplier-menu"]');
    await expect(floatingMenu).toBeVisible();
    await expect(triggerBtn).toHaveAttribute('aria-expanded', 'true');

    // 2. Escape key dismissal
    await page.keyboard.press('Escape');
    await expect(floatingMenu).toHaveCount(0);
    await expect(triggerBtn).toHaveAttribute('aria-expanded', 'false');

    // 3. Reopen & Backdrop click dismissal
    await triggerBtn.click();
    await expect(floatingMenu).toBeVisible();
    await page.locator('[data-testid="floating-menu-backdrop"]').click({ position: { x: 10, y: 10 } });
    await expect(floatingMenu).toHaveCount(0);

    // 4. Verify no horizontal or vertical table layout overflow from menu
    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(isOverflowing).toBe(false);
  });

  test('Sprint 1: Role-Based Access Guard — Staff redirected away', async ({ page }) => {
    const staffContext = await page.context().browser()!.newContext();
    const staffPage = await staffContext.newPage();
    await staffContext.addInitScript(() => {
      localStorage.setItem('role', 'staff');
    });
    await staffPage.goto('http://localhost:3000/suppliers');
    await staffPage.waitForURL('**/dashboard');
    expect(staffPage.url()).toContain('/dashboard');
    await staffContext.close();
  });

  test('Sprint 2A: Supplier Detail — Command Header, Products Intelligence, Purchase Search/Filters, and Unified Activity', async ({ page }) => {
    // 1. Create Supplier
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Apex Auto Spares');
    await page.locator('.fixed input[placeholder*="Rajesh Kumar"]').fill('Vikram Malhotra');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('123 Auto Hub, Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9822114455');
    await page.locator('.fixed input[placeholder="98765 43210"]').nth(1).fill('9822114455');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('vikram@apexspares.com');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('27AAAAA0000A1Z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // 2. Navigate to Supplier Detail
    await page.locator('tbody tr:has-text("Apex Auto Spares") a:has-text("Apex Auto Spares")').click();
    await page.waitForURL('**/suppliers/s-*');

    // 3. Verify Command Header
    await expect(page.locator('h1:has-text("Apex Auto Spares")')).toBeVisible();
    await expect(page.locator('text=27AAAAA0000A1Z5').first()).toBeVisible();
    await expect(page.locator('text=Vikram Malhotra').first()).toBeVisible();
    await expect(page.locator('a[href="tel:9822114455"]').first()).toBeVisible();
    await expect(page.locator('a[href*="wa.me"]').first()).toBeVisible();
    await expect(page.locator('a[href="mailto:vikram@apexspares.com"]').first()).toBeVisible();

    // 4. Test Copy button on Supplier ID
    const copyIdBtn = page.locator('button[title="Copy Supplier ID"]');
    await expect(copyIdBtn).toBeVisible();
    await copyIdBtn.click();

    // 5. Test Copy button on GSTIN
    const copyGstBtn = page.locator('button[title="Copy GSTIN"]');
    await expect(copyGstBtn).toBeVisible();
    await copyGstBtn.click();

    // 6. Test Record Invoice from Command Header
    await page.locator('button:has-text("Record Invoice")').click();
    await expect(page.locator('h2:has-text("Record Supplier Invoice")')).toBeVisible();
    await page.locator('button:has-text("Cancel")').first().click();

    // 7. Verify Tabs exist
    await expect(page.locator('button:has-text("Products Supplied")')).toBeVisible();
    await expect(page.locator('button:has-text("Purchase History")')).toBeVisible();
    await expect(page.locator('button:has-text("Activity")')).toBeVisible();

    // 8. Switch to Products Supplied Tab
    await page.locator('button:has-text("Products Supplied")').click();
    await expect(page.locator('text=Products Supplied & Procurement Intelligence')).toBeVisible();

    // 9. Switch to Purchase History Tab and verify empty state & CTA
    await page.locator('button:has-text("Purchase History")').click();
    await expect(page.locator('text=No Purchases Recorded Yet')).toBeVisible();
    await expect(page.locator('button:has-text("Record First Purchase")')).toBeVisible();

    // 10. Switch to Activity Tab and verify unified stream header & empty state
    await page.locator('button:has-text("Activity")').click();
    await expect(page.locator('text=Supplier Activity Stream')).toBeVisible();
    await expect(page.locator('text=No Activity Recorded Yet')).toBeVisible();
  });

  test('Sprint 2B: Financial Aging Intelligence & Due-Bucket Analysis', async ({ page }) => {
    // 1. Create Supplier with unique name
    await page.locator('button[data-testid="add-supplier-btn"]').click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Dyno Motors India');
    await page.locator('.fixed input[placeholder*="Rajesh Kumar"]').fill('Aditya Sharma');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Plot 45, Industrial Area, Gurgaon');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9811002233');
    await page.locator('.fixed input[placeholder="98765 43210"]').nth(1).fill('9811002233');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('aditya@dynomotors.com');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('07AAAAA1111A1Z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // 2. Navigate to Supplier Details
    await page.locator('tbody tr:has-text("Dyno Motors India") a:has-text("Dyno Motors India")').click();
    await page.waitForURL('**/suppliers/s-*');

    // 3. Verify Aging Analysis Tab exists and shows settled state
    const agingTabBtn = page.getByRole('button', { name: 'Aging Analysis', exact: true });
    await expect(agingTabBtn).toBeVisible();
    await agingTabBtn.click();
    await expect(page.locator('text=Outstanding Aging Analysis')).toBeVisible();
    await expect(page.locator('text=No Outstanding Dues')).toBeVisible();

    // 4. Inject purchases with varying ages to test multi-bucket assignment
    await page.evaluate(() => {
      const stateStr = localStorage.getItem('autovault_store');
      if (!stateStr) return;
      const parsed = JSON.parse(stateStr);
      const supplier = (parsed.suppliers || []).find((s: any) => s.name === 'Dyno Motors India');
      if (!supplier) return;

      const product = (parsed.products || [])[0] || {
        id: 'p-dyno-test',
        name: 'Brake Disc Rotor',
        sku: 'BDR-100',
        buyPrice: 1000,
        sellPrice: 1500,
        stock: 50,
        minStock: 10,
        category: 'Braking',
        brand: 'Dyno',
        unit: 'pcs',
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!parsed.products) parsed.products = [];
      if (!parsed.products.some((p: any) => p.id === product.id)) {
        parsed.products.push(product);
      }

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // Purchase 1: 15 days old -> Bucket 0–30d (₹10,000)
      const p1 = {
        id: 'pur-dyno-15d',
        productId: product.id,
        supplierId: supplier.id,
        quantity: 10,
        buyPrice: 1000,
        totalAmount: 10000,
        paidAmount: 0,
        paymentStatus: 'Credit',
        invoiceNumber: 'INV-DYNO-15D',
        date: new Date(now - 15 * dayMs).toISOString(),
        createdAt: new Date(now - 15 * dayMs).toISOString(),
      };

      // Purchase 2: 45 days old -> Bucket 31–60d (₹20,000)
      const p2 = {
        id: 'pur-dyno-45d',
        productId: product.id,
        supplierId: supplier.id,
        quantity: 20,
        buyPrice: 1000,
        totalAmount: 20000,
        paidAmount: 0,
        paymentStatus: 'Credit',
        invoiceNumber: 'INV-DYNO-45D',
        date: new Date(now - 45 * dayMs).toISOString(),
        createdAt: new Date(now - 45 * dayMs).toISOString(),
      };

      // Purchase 3: 100 days old -> Bucket 90+d (₹50,000)
      const p3 = {
        id: 'pur-dyno-100d',
        productId: product.id,
        supplierId: supplier.id,
        quantity: 50,
        buyPrice: 1000,
        totalAmount: 50000,
        paidAmount: 0,
        paymentStatus: 'Credit',
        invoiceNumber: 'INV-DYNO-100D',
        date: new Date(now - 100 * dayMs).toISOString(),
        createdAt: new Date(now - 100 * dayMs).toISOString(),
      };

      if (!parsed.purchases) parsed.purchases = [];
      parsed.purchases.push(p1, p2, p3);
      localStorage.setItem('autovault_store', JSON.stringify(parsed));
    });

    // Reload page to rehydrate injected state
    await page.reload();

    // 5. Navigate to Aging Analysis tab and verify active aging intelligence
    await page.getByRole('button', { name: 'Aging Analysis', exact: true }).click();
    await expect(page.locator('text=Outstanding Aging Analysis')).toBeVisible();

    // Verify Total Outstanding liability is ₹80,000 across 3 open invoices
    await expect(page.locator('text=₹80,000').first()).toBeVisible();
    await expect(page.locator('text=3 Open Invoices')).toBeVisible();

    // Verify Oldest Open Invoice highlight (INV-DYNO-100D with age ~100d and ₹50,000 due)
    await expect(page.locator('text=Oldest Open Invoice')).toBeVisible();
    await expect(page.locator('text=INV-DYNO-100D').first()).toBeVisible();
    await expect(page.locator('text=100 Days').first()).toBeVisible();

    // Verify Bucket Cards are present
    await expect(page.locator('text=0–30 Days').first()).toBeVisible();
    await expect(page.locator('text=31–60 Days').first()).toBeVisible();
    await expect(page.locator('text=90+ Days').first()).toBeVisible();

    // 6. Test Drilldown interaction
    const bucket90Btn = page.locator('button:has-text("90+d (1)")');
    await expect(bucket90Btn).toBeVisible();
    await bucket90Btn.click();

    // Drilldown table should show INV-DYNO-100D with ₹50,000
    await expect(page.locator('table tr:has-text("INV-DYNO-100D")')).toBeVisible();

    // Reset drilldown
    await page.locator('button:has-text("Reset to All Invoices")').click();
    await expect(page.locator('table tr:has-text("INV-DYNO-15D")')).toBeVisible();

    // 7. Verify Overview tab quick liability summary card
    await page.locator('button:has-text("Overview")').click();
    await expect(page.locator('text=Liability Aging Status')).toBeVisible();
    await expect(page.locator('text=₹50,000 in 90d+')).toBeVisible();

    // 8. Go back to /suppliers list and verify 90d+ Attention filter pill and table badge
    await page.goto('http://localhost:3000/suppliers');
    await expect(page.locator('text=90d+ Attention').first()).toBeVisible();
    await expect(page.locator('table tr:has-text("Dyno Motors India") text=90d+ Critical')).toBeVisible();

    // Click 90d+ Attention filter pill and verify filtered view
    await page.locator('button:has-text("90d+ Attention")').first().click();
    await expect(page.locator('table tr:has-text("Dyno Motors India")')).toBeVisible();
  });
});

