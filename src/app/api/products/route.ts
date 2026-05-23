import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

export async function GET() {
  try {
    // Try with double quotes (exact case)
    const result1 = await pool.query('SELECT * FROM "Product"');
    console.log('With "Product":', result1.rowCount);
    
    // Try without quotes (lowercase)
    const result2 = await pool.query('SELECT * FROM product');
    console.log('With product:', result2.rowCount);
    
    // Try with "products"
    const result3 = await pool.query('SELECT * FROM "products"');
    console.log('With "products":', result3.rowCount);
    
    // Return whichever has data
    if (result1.rowCount > 0) return Response.json(result1.rows);
    if (result2.rowCount > 0) return Response.json(result2.rows);
    if (result3.rowCount > 0) return Response.json(result3.rows);
    
    return Response.json({ message: 'No products found' }, { status: 404 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Database error' }, { status: 500 });
  }
}