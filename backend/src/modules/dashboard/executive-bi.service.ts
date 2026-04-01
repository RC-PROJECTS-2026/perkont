/**
 * Executive BI Dashboard: ciro, pipeline, yenileme orani, denetci verimliligi
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ExecutiveBiService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async getExecutiveDashboard(companyId?: string): Promise<any> {
    const companyFilter = companyId ? `AND c.companyId = '${companyId}'` : '';

    const [revenue, pipeline, renewalRate, inspectorPerf, customerAnalysis, monthlyTrend, complaintStats] = await Promise.all([
      // Aylik ciro (fatura bazli)
      this.dataSource.query(`
        SELECT
          DATE_FORMAT(ib.invoiceDate, '%Y-%m') as month,
          SUM(ib.totalWithVat) as revenue,
          COUNT(DISTINCT ib.id) as invoiceCount
        FROM invoice_batches ib
        JOIN customers c ON c.id = ib.customerId
        WHERE ib.status NOT IN ('cancelled') AND ib.invoiceDate >= DATE_SUB(NOW(), INTERVAL 12 MONTH) ${companyFilter}
        GROUP BY month ORDER BY month
      `),

      // Satis pipeline degeri
      this.dataSource.query(`
        SELECT
          status,
          COUNT(*) as count,
          SUM(estimatedValue) as totalValue
        FROM sales_opportunities so
        JOIN customers c ON c.id = so.customerId
        WHERE so.status NOT IN ('lost') ${companyFilter}
        GROUP BY status
      `),

      // Sozlesme yenileme orani (son 12 ay)
      this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM contract_documents cd JOIN customers c ON c.id = cd.customerId WHERE cd.status = 'active' ${companyFilter}) as activeContracts,
          (SELECT COUNT(*) FROM contract_documents cd JOIN customers c ON c.id = cd.customerId WHERE cd.status = 'expired' AND cd.endDate >= DATE_SUB(NOW(), INTERVAL 12 MONTH) ${companyFilter}) as expiredContracts,
          (SELECT COUNT(*) FROM contract_documents cd JOIN customers c ON c.id = cd.customerId WHERE cd.status = 'terminated' AND cd.updatedAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH) ${companyFilter}) as terminatedContracts
      `),

      // Denetci verimliligi (son 30 gun)
      this.dataSource.query(`
        SELECT u.id, u.fullName,
          COUNT(DISTINCT i.id) as inspectionCount,
          COUNT(DISTINCT DATE(i.completedAt)) as workDays,
          ROUND(COUNT(DISTINCT i.id) / GREATEST(COUNT(DISTINCT DATE(i.completedAt)), 1), 1) as avgPerDay
        FROM users u
        LEFT JOIN inspections i ON i.inspectorId = u.id AND i.completedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        WHERE u.roles LIKE '%inspector%' AND u.isActive = 1
        GROUP BY u.id ORDER BY inspectionCount DESC LIMIT 20
      `),

      // Musteri bazli gelir analizi (top 10)
      this.dataSource.query(`
        SELECT c.id, c.name, c.code,
          COUNT(DISTINCT ib.id) as invoiceCount,
          COALESCE(SUM(ib.totalWithVat), 0) as totalRevenue,
          COUNT(DISTINCT e.id) as equipmentCount
        FROM customers c
        LEFT JOIN invoice_batches ib ON ib.customerId = c.id AND ib.status NOT IN ('cancelled')
        LEFT JOIN equipment e ON e.customerId = c.id AND e.status = 'active'
        WHERE c.isActive = 1 ${companyFilter}
        GROUP BY c.id ORDER BY totalRevenue DESC LIMIT 10
      `),

      // Aylik denetim trendi
      this.dataSource.query(`
        SELECT
          DATE_FORMAT(i.completedAt, '%Y-%m') as month,
          COUNT(*) as totalInspections,
          SUM(CASE WHEN i.overallResult = 'uygun' THEN 1 ELSE 0 END) as compliant,
          SUM(CASE WHEN i.overallResult = 'uygunsuz' THEN 1 ELSE 0 END) as nonCompliant
        FROM inspections i
        WHERE i.completedAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH) AND i.status = 'approved'
        GROUP BY month ORDER BY month
      `),

      // Sikayet istatistikleri
      this.dataSource.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
          ROUND(AVG(DATEDIFF(COALESCE(resolvedAt, NOW()), createdAt)), 0) as avgResolutionDays
        FROM complaints WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      `),
    ]);

    return {
      revenue: { monthly: revenue },
      pipeline: { byStatus: pipeline, totalValue: pipeline.reduce((s: number, r: any) => s + Number(r.totalValue || 0), 0) },
      contractRenewal: renewalRate[0] || {},
      inspectorPerformance: inspectorPerf,
      topCustomers: customerAnalysis,
      inspectionTrend: monthlyTrend,
      complaints: complaintStats[0] || {},
    };
  }
}
