import { test, expect } from '@playwright/test';

test.describe('AutoVault Suppliers Module — Enterprise Validation Suite', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('role', 'owner');
    });
    await page.goto('http://localhost:3000/suppliers');
    await page.evaluate(() => localStorage.removeItem('autovault_store'));
    await page.reload();
  });

  test('Scenario 1: Name + Address + Phone creates supplier successfully', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Minda Industries Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Thane West');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Minda Industries Ltd.');
  });

  test('Scenario 2: Name + Address + Email creates supplier successfully', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Bosch India');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Bangalore Electronic City');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('sales@bosch.in');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Bosch India');
  });

  test('Scenario 3: Name + Address + Phone + Email creates supplier successfully', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Lumax Auto Technologies');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune MIDC');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9822012345');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('contact@lumax.com');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Lumax Auto Technologies');
  });

  test('Scenario 4: Name + Address without Phone/Email is blocked', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Uno Minda Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Gurgaon Sector 18');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('At least one contact method (Phone or Email) is required.');
  });

  test('Scenario 5: Name + Phone without Address is blocked', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Exide Industries');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9830012345');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier address is required.');
  });

  test('Scenario 6: Name + Email without Address (whitespace-only) is blocked', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Amaron Batteries');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('support@amaron.com');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('   ');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier address is required.');
  });

  test('Scenario 7: Optional fields empty is accepted', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('7 Star Accessories');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Mumbai Central');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9820011223');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('Scenario 8 & 9: Invalid Phone and Email are blocked', async ({ page }) => {
    await page.locator('button:has-text("Add Supplier")').first().click();
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
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Minda Industries Ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Thane');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('sales@minda.com');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('29ABCDE1234F1Z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Try adding duplicate name (case variation)
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('minda industries ltd.');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9811122233');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Supplier with this name already exists.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate phone
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 1');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9876543210');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this phone number.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate email
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 2');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder*="supplier@example.com"]').fill('SALES@MINDA.COM');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this email address.');
    await page.locator('.fixed button:has-text("Cancel")').click();

    // Try adding duplicate GST
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Unique Name 3');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Pune');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9844455566');
    await page.locator('.fixed input[placeholder*="29ABCDE1234F1Z5"]').fill('29abcde1234f1z5');
    await page.locator('.fixed button:has-text("Add Supplier")').click();
    await expect(page.locator('.fixed.inset-0')).toContainText('Another supplier already uses this GSTIN.');
  });

  test('Scenario 14, 15, 16: Same Phone+WhatsApp allowed, Edit unchanged allowed, Edit duplicate blocked', async ({ page }) => {
    // Add Supplier A
    await page.locator('button:has-text("Add Supplier")').first().click();
    await page.locator('.fixed input[placeholder*="Minda Industries"]').fill('Supplier A');
    await page.locator('.fixed textarea[placeholder*="Full business address"]').fill('Address A');
    await page.locator('.fixed input[placeholder="98765 43210"]').first().fill('9899988877');
    await page.locator('.fixed input[placeholder="98765 43210"]').nth(1).fill('9899988877');
    await page.locator('.fixed button:has-text("Add Supplier")').click();

    // Add Supplier B
    await page.locator('button:has-text("Add Supplier")').first().click();
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
});
