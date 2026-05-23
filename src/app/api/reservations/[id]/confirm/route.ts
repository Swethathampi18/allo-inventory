export const dynamic = 'force-dynamic';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    const result = await pool.query(
      `UPDATE "Reservation" 
       SET status = 'confirmed', confirmed_at = NOW() 
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );
    
    if (result.rowCount && result.rowCount === 0) {
      return Response.json({ error: 'Reservation not found or already confirmed' }, { status: 404 });
    }
    
    return Response.json({ success: true, reservation: result.rows[0] });
  } catch (error) {
    console.error('Error confirming reservation:', error);
    return Response.json({ error: 'Failed to confirm reservation' }, { status: 500 });
  }
}