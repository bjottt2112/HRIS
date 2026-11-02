import { prisma } from "./prisma";

export async function getOrCreateCompany() {
  const company = await prisma.company.findFirst({ orderBy: { id: "asc" } });

  if (company) return company;

  return prisma.company.create({
    data: { name: "Montreux Corp", timezone: "Asia/Jakarta" },
  });
}
