import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500')));
    const skip = (page - 1) * limit;

    const wallets = await prisma.wallet.findMany();
    const txRecords = await prisma.txRecord.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
    const totalRecords = await prisma.txRecord.count();
    const metrics = await prisma.metric.findFirst();

    return NextResponse.json({
      wallets,
      txRecords,
      metrics,
      pagination: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

