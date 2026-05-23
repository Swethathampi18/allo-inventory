import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

export async function GET() {
  try {
    // Example: expire old reservations
    const result = await pool.query(`
      UPDATE "Reservation" 
      SET status = 'expired' 
      WHERE expires_at < NOW() AND status = 'active'
      RETURNING id
    `);
    
    return Response.json({ 
      success: true, 
      expired: result.rowCount 
    });
  } catch (error) {
    console.error('Cron error:', error);
    return Response.json({ error: 'Failed to expire reservations' }, { status: 500 });
  }
}