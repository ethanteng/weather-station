import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearLastRun() {
  try {
    console.log('Clearing lastRunAt and lastResult from all automation rules...');
    
    const result = await prisma.automationRule.updateMany({
      data: {
        lastRunAt: null,
        lastResult: null,
      },
    });

    console.log(`Successfully cleared lastRunAt and lastResult for ${result.count} automation rule(s).`);
  } catch (error) {
    console.error('Error clearing lastRunAt:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearLastRun();
