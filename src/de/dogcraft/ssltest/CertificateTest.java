package de.dogcraft.ssltest;

import java.io.IOException;
import java.lang.reflect.Field;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map.Entry;

import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.ASN1String;
import org.bouncycastle.asn1.x509.AccessDescription;
import org.bouncycastle.asn1.x509.AuthorityInformationAccess;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.CRLDistPoint;
import org.bouncycastle.asn1.x509.Certificate;
import org.bouncycastle.asn1.x509.DistributionPoint;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.asn1.x509.TBSCertificate;
import org.bouncycastle.crypto.tls.Bouncy;

public class CertificateTest {
	private static HashMap<String, Integer> kusMap = new HashMap<>();
	private static HashMap<String, String> ekusMap = new HashMap<>();
	static {
		Field[] f = KeyUsage.class.getFields();
		for (Field field : f) {
			try {
				kusMap.put(field.getName(), field.getInt(null));
			} catch (ReflectiveOperationException e) {
				e.printStackTrace();
			}
		}
		f = KeyPurposeId.class.getFields();
		for (Field field : f) {
			try {
				ekusMap.put(((KeyPurposeId) field.get(null)).getId(),
						field.getName());
			} catch (ReflectiveOperationException e) {
				e.printStackTrace();
			}
		}
	}
	public static void testCerts(TestOutput pw, Bouncy b) throws IOException {
		pw.enterTest("Looking at certificate");

		Certificate[] c = b.getCert().getCertificateList();
		Certificate primary = c[0];
		TBSCertificate tbs = primary.getTBSCertificate();
		Date start = tbs.getStartDate().getDate();
		Date end = tbs.getEndDate().getDate();
		SimpleDateFormat sdf = new SimpleDateFormat(
				"EEE, d MMM yyyy HH:mm:ss 'UTC'");
		pw.output("Start: " + sdf.format(start));
		pw.output("End: " + sdf.format(end));
		Date now = new Date();
		if (start.before(now) && end.after(now)) {
			pw.output("Dates match.");
		} else {
			pw.output("Out of dates.");
		}
		for (int i = 0; i < c.length; i++) {
			pw.output((i == 0 ? "Subject " : "Additional Subject ")
					+ c[i].getSubject().toString());
		}

		pw.enterTest("Verifying extensions");
		testBasicConstraints(pw, tbs);
		testKeyUsage(pw, tbs);
		testExtendedKeyUsage(pw, tbs);
		testCRL(pw, tbs);
		testSAN(pw, tbs);
		testAIA(pw, tbs);
		HashMap<String, TestResult> tr = pw.getSubresults();
		float val = 0;
		for (Entry<String, TestResult> e : tr.entrySet()) {
			val += e.getValue().getRes();
		}
		val /= tr.size();
		pw.exitTest("Verifying extensions", new TestResult(val));

		pw.exitTest("Looking at certificate", TestResult.IGNORE);

	}
	private static void testAIA(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs, Extension.authorityInfoAccess);

		if (ext != null) {
			AuthorityInformationAccess aia = AuthorityInformationAccess
					.getInstance(ext.getParsedValue());
			pw.enterTest("authorityInfoAccess");
			outputCritical(pw, ext);
			AccessDescription[] data = aia.getAccessDescriptions();
			for (AccessDescription accessDescription : data) {
				if (accessDescription.getAccessMethod().equals(
						AccessDescription.id_ad_ocsp)) {
					pw.output("type: OCSP");
				} else {
					pw.output("type: " + accessDescription.getAccessMethod());
				}
				pw.output("loc: " + accessDescription.getAccessLocation());
			}
			pw.exitTest("authorityInfoAccess", TestResult.IGNORE);
		}
	}
	private static void outputCritical(TestOutput pw, Extension ext) {
		if (ext.isCritical()) {
			pw.output("is critical");
		} else {
			pw.output("is not critical");
		}
	}
	private static void testSAN(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs,
				Extension.subjectAlternativeName);

		pw.enterTest("SubjectAltNames");
		if (ext != null) {
			float mult = testCrit(false, pw, "subjectAlternativeNames", ext);
			outputCritical(pw, ext);

			ASN1Sequence ds = ASN1Sequence.getInstance(ext.getParsedValue());
			Enumeration obj = ds.getObjects();
			while (obj.hasMoreElements()) {
				GeneralName genName = GeneralName
						.getInstance(obj.nextElement());
				if (genName.getTagNo() == GeneralName.dNSName) {
					pw.output("DNS: "
							+ ((ASN1String) genName.getName()).getString());
				} else if (genName.getTagNo() != 0) {
					pw.output("Unknown SAN name tag" + genName.getTagNo());
				} else {
					pw.output("Unknown SAN name " + genName.getName());
				}
			}
			pw.exitTest("SubjectAltNames", new TestResult(mult));
		} else {
			pw.exitTest("SubjectAltNames", TestResult.FAILED);
		}
	}
	private static void testCRL(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs,
				Extension.cRLDistributionPoints);
		pw.enterTest("CRLDistrib");
		if (ext != null) {
			float mult = testCrit(false, pw, "CRLDistPoints", ext);
			outputCritical(pw, ext);

			DistributionPoint[] points = CRLDistPoint.getInstance(
					ext.getParsedValue()).getDistributionPoints();
			for (DistributionPoint distributionPoint : points) {
				pw.output("CRL-name: "
						+ distributionPoint.getDistributionPoint().toString()
								.replace("\n", "\ndata: "));
				pw.output("CRL-issuer: " + distributionPoint.getCRLIssuer());
			}
			pw.exitTest("CRLDistrib", new TestResult(mult));
		} else {
			pw.output("Missing CRLs");
			pw.exitTest("CRLDistrib", TestResult.FAILED);
		}

	}
	private static void testExtendedKeyUsage(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs, Extension.extendedKeyUsage);

		if (ext != null) {
			pw.enterTest("ExtendedKeyUsage");
			outputCritical(pw, ext);
			float mult = testCrit(false, pw, "extendedKeyUsage", ext);
			ExtendedKeyUsage eku = ExtendedKeyUsage.getInstance(ext
					.getParsedValue());

			KeyPurposeId[] kpi = eku.getUsages();
			StringBuffer ekus = new StringBuffer();
			boolean sslserv = false;
			for (KeyPurposeId keyPurposeId : kpi) {
				if (keyPurposeId.equals(KeyPurposeId.id_kp_serverAuth)) {
					sslserv = true;
				}
				String s = ekusMap.get(keyPurposeId.getId());
				if (s != null) {
					ekus.append(s);
				} else {
					ekus.append("Unknown (" + keyPurposeId.getId() + ")");
				}
				ekus.append(", ");
			}
			TestResult res = new TestResult(mult);
			if (!sslserv) {
				pw.output("Strange Extended Key usage (serverAuth missing)");
				res = TestResult.FAILED;
			}
			pw.output("ExtendedKeyUsage: " + ekus.toString());
			pw.exitTest("ExtendedKeyUsage", res);

		}
	}
	private static void testKeyUsage(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs, Extension.keyUsage);
		pw.enterTest("KeyUsage");
		if (ext != null) {
			outputCritical(pw, ext);

			KeyUsage ku = KeyUsage.getInstance(ext.getParsedValue());
			StringBuffer kus = new StringBuffer();
			for (Entry<String, Integer> ent : kusMap.entrySet()) {
				if (ku.hasUsages(ent.getValue())) {
					kus.append(ent.getKey());
					kus.append(" ");
				}
			}
			pw.output("Key usages: " + kus.toString());
			TestResult passage = new TestResult(1);
			if (!ku.hasUsages(KeyUsage.keyAgreement | KeyUsage.keyEncipherment)) {
				pw.output("Strange key usage flags for an ssl server certificate.");
				passage = TestResult.FAILED;
			}
			pw.exitTest("KeyUsage", passage);
		} else {
			pw.output("Keyusage extension not present.");
			pw.exitTest("KeyUsage", TestResult.FAILED);
		}
	}
	private static void testBasicConstraints(TestOutput pw, TBSCertificate tbs) {
		Extension ext = extractCertExtension(tbs, Extension.basicConstraints);

		pw.enterTest("BasicConstraints");
		if (ext == null) {
			pw.output("Basic constraints missing.");
			pw.exitTest("BasicConstraints", new TestResult(0.2f));
			return;
		}
		outputCritical(pw, ext);

		BasicConstraints bc = BasicConstraints
				.getInstance(ext.getParsedValue());
		float mult = testCrit(true, pw, "basicContraints", ext);
		if (bc.isCA()) {
			pw.output("Your server certificate is a CA!!!");
			pw.exitTest("BasicConstraints", TestResult.FAILED);
		} else {
			pw.output("Your server certificate not a CA.");
			pw.exitTest("BasicConstraints", new TestResult(mult));
		}
	}
	private static Extension extractCertExtension(TBSCertificate tbs,
			ASN1ObjectIdentifier oid) {
		Extension ext = tbs.getExtensions().getExtension(oid);
		return ext;
	}
	private static float testCrit(boolean crit, TestOutput pw, String type,
			Extension ext) {
		if (!ext.isCritical() && crit) {
			pw.output("extension " + type
					+ " is marked non-critical, when it should be");
			return 0.5f;
		}
		return 1f;
	}
}
