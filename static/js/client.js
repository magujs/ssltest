function generateOIDInfoHref(oid, dict) {
	var content = dict[oid];
	if (content === undefined) {
		content = oid;
	}

	var a = document.createElement("a");
	a.appendChild(document.createTextNode(content));
	a.setAttribute("href", "http://www.oid-info.com/cgi-bin/display?tree="
			+ encodeURIComponent(oid));
	a.setAttribute("title", oid);
	a.setAttribute("target", "_blank");
	return a;
}

function createHeader(content) {
	var h = document.createElement("h1");
	h.appendChild(document.createTextNode(content));
	return h;
}

function hrefjump(e) {
	var body = document.getElementsByTagName("body")[0];
	var target = document.getElementById(this.getAttribute("href").substring(1));
	var left = 0;
	var top = 0;

	var watch = target;
	while (watch !== body) {
		left += watch.offsetLeft;
		top += watch.offsetTop;
		watch = watch.offsetParent;
	}
	window.scroll(left, top - 55)
	return false;
}

var idcounter = 0;

function events() {
	var domain = document.getElementById('domain').value;
	var port = document.getElementById('port').value;

	if (port.trim() == "") {
		port = 443;
	}

	var iplist = new Array();

	var handleMessage = function(container, stream, msg) {
		// var message = JSON.parse(e.data);
		var text = document.createTextNode(msg);
		var node = document.createElement("div");
		node.appendChild(text);
		container.appendChild(node);
	};

	var handleError = function(container, stream, msg) {
		stream.close();
		handleMessage(container, stream, "error");
	};

	function hostInfoToURL(hostinfo, base) {
		if (base === undefined) {
			base = "/test.event"
		}
		return base + '?domain=' + encodeURIComponent(hostinfo.domain)
				+ (hostinfo.ip ? '&ip=' + encodeURIComponent(hostinfo.ip) : '')
				+ '&port=' + encodeURIComponent(hostinfo.port);
	}

	function Stream(c, url) {
		this.getTargetContainer = function() {
			return c;
		}

		var stream = new EventSource(url);
		var streamSelf = this;
		this.registerEvent = function(name, handler) {
			stream.addEventListener(name, function(event) {
				handler(streamSelf.getTargetContainer(), stream, event);
			});
		};

		this.registerEvent("open", function(container, stream, event) {
			// handleMessage(container, stream, "Stream started!");
		});

		this.registerEvent("message", function(container, stream, event) {
			// handleMessage(container, stream, event.data);
		});

		this.registerEvent("eof", function(container, stream, event) {
			stream.close();
			// handleMessage(container, stream, "Stream finished!");
		});
	}

	function HostIP(c, hostinfo, idbase) {
		var domain = hostinfo.domain;
		var port = hostinfo.port;
		var ip = hostinfo.ip;

		var url = hostInfoToURL(hostinfo);
		var stream = new Stream(c, url);

		var stack = new Array();
		stack.push({
			fs : c
		});

		stream.getTargetContainer = function() {
			return stack[stack.length - 1].fs;
		}; // Overriding...

		var isRunning = document.createElement("span");
		(function() { // generate Legend
			var legend = document.createElement("legend");
			legend.setAttribute("class", "host-legend");
			legend.appendChild(document.createTextNode(ip));
			var hr = document.createElement("a");
			hr.setAttribute("href", hostInfoToURL(hostinfo, "/test.txt"));
			hr.setAttribute("target", "_blank");
			hr.appendChild(document.createTextNode("raw"));
			legend.appendChild(hr);
			isRunning.appendChild(document.createTextNode("*"));
			isRunning.style.backgroundColor = '#FF0';
			legend.appendChild(isRunning);
			c.appendChild(legend);
		})();

		stream.registerEvent("open", function(container, stream, event) {
			isRunning.style.backgroundColor = '#F00';
		});
		stream.registerEvent("eof", function(container, stream, event) {
			console.log("ending");
			isRunning.style.backgroundColor = '#0F0';
		});
		stream.registerEvent("enter", function(c, s, e) {
			return;
			var fs = document.createElement("fieldset");
			var legend = document.createElement("legend");
			var legendT = document.createTextNode(e.data);
			legend.appendChild(legendT);
			fs.appendChild(legend);
			c.appendChild(fs);

			stack.push({
				fs : fs,
				leg : legend,
				legT : legendT
			});
		});

		stream.registerEvent("exit", function(c, s, e) {
			return;
			var frame = stack.pop();

			var legT = document.createTextNode(e.data);
			frame.leg.removeChild(frame.legT);
			frame.leg.appendChild(legT);
		});
		(function() {
			function appendX500Name(div, name) {
				div.setAttribute("class", "x500name");
				for (rdn in name) {
					var span = document.createElement("span");
					span.setAttribute("class", "rdn");
					for (ava in name[rdn]) {
						var avaspan = document.createElement("span");
						avaspan.setAttribute("class", "ava");
						var keySpan = document.createElement("span");
						keySpan.appendChild(generateOIDInfoHref(ava, dnOIDs));

						var valSpan = document.createElement("span");
						var val = name[rdn][ava];
						if (val === null) {
							valSpan.setAttribute("class", "unknownVal");
							valSpan.appendChild(document.createTextNode("<unknown>"));
						} else {
							valSpan.appendChild(document.createTextNode(val));
						}

						avaspan.appendChild(keySpan);
						avaspan.appendChild(document.createTextNode(": "));
						avaspan.appendChild(valSpan);
						span.appendChild(avaspan);
					}
					div.appendChild(span);
				}
			}

			var certificates = document.createElement("div");
			certificates.appendChild(createHeader("Certificates"));
			var certificateLookup = {};
			stream.registerEvent("certificate",
					function(c, s, e) {
						var certificate = JSON.parse(e.data);
						var certificateElem = document.createElement("div");
						var certTable = document.createElement("table");
						certTable.setAttribute("class", "certTable")
						certificateElem.appendChild(certTable);
						var keys = {
							id : "id",
							subj : "Subject",
							issuer : "Issuer",
							key : "Key",
							from : "Valid From",
							to : "Valid To",
							sig : "Signature"
						};
						var tds = {};
						for ( var i in keys) {
							var tr = document.createElement("tr");
							var k = document.createElement("td");
							k.appendChild(document.createTextNode(keys[i]))
							tr.appendChild(k);
							var v = document.createElement("td");
							tr.appendChild(v);
							certTable.appendChild(tr);
							tds[i] = v;
						}
						certificateElem.setAttribute("id", idbase + "cert-"
								+ certificate.hash);
						certificateElem.setAttribute("class", "certificate");
						tds.id.appendChild(document.createTextNode(certificate.hash));

						{ // the ^{pem}-link
							var raw = document.createElement("a");
							raw.appendChild(document.createTextNode("pem"));
							raw.setAttribute("class", "rawcert");
							raw.setAttribute("href", "data:text/plain;base64,"
									+ btoa(certificate.data));
							raw.setAttribute("target", "_blank");
							tds.id.appendChild(raw);

							
							var asn1js = document.createElement("a");
							asn1js.appendChild(document.createTextNode("asn1.js"));
							asn1js.setAttribute("class", "rawcert");
							asn1js.setAttribute("href", "http://lapo.it/asn1js/#"
									+ certificate.data);
							asn1js.setAttribute("target", "_blank");
							tds.id.appendChild(asn1js);

							
						}

						appendX500Name(tds.subj, certificate.subject);
						appendX500Name(tds.issuer, certificate.issuer);
						certificateLookup[certificate.hash] = {
							elem : certificateElem,
							tab : tds
						};

						certificates.appendChild(certificateElem);
					});

			stream.registerEvent("certkey", function(c, s, e) {
				var certificate = JSON.parse(e.data);
				var validitySpan = document.createElement("div");
				certificateLookup[certificate.hash].tab.key.appendChild(document
						.createTextNode(certificate.type + ":" + certificate.size));
				certificateLookup[certificate.hash].tab.sig.appendChild(generateOIDInfoHref(certificate.sig, sigOIDs));
			});
			stream.registerEvent("certvalidity", function(c, s, e) {
				var certificate = JSON.parse(e.data);
				certificateLookup[certificate.hash].tab.from.appendChild(document
						.createTextNode(certificate.start));
				certificateLookup[certificate.hash].tab.to.appendChild(document
						.createTextNode(certificate.end));
			});
			c.appendChild(certificates);
		})();
		(function() {
			var chains = document.createElement("div");

			var chainObjs = {};
			stream.registerEvent("chain", function(c, s, e) {
				var chain = JSON.parse(e.data);
				var chainElem = document.createElement("div");
				for ( var i in chain.content) {
					var a = document.createElement("a");
					a.appendChild(document.createTextNode(chain.content[i]));
					a.setAttribute("href", "#" + idbase + "cert-" + chain.content[i])
					a.onclick = hrefjump;
					chainElem.appendChild(a);
					chainElem.appendChild(document.createTextNode(", "));
				}
				var referencedBy = document.createElement("div");
				referencedBy.appendChild(document.createTextNode("Set by cipher: "));

				chainElem.appendChild(referencedBy);
				chains.appendChild(chainElem);
				chainObjs[chain.id] = {
					elem : chainElem,
					ref : referencedBy
				};
			});
			stream
					.registerEvent(
							"chainFound",
							function(c, s, e) {
								var chain = JSON.parse(e.data);
								var span = document.createElement("a");
								span
										.appendChild(document.createTextNode("0x" + chain.cipherId));
								span.setAttribute("title", chain.cipherName);
								span.setAttribute("href", "#" + idbase + "cipher-"
										+ chain.cipherId);
								span.onclick = hrefjump;
								chainObjs[chain.chainId].ref.appendChild(span);
								chainObjs[chain.chainId].ref.appendChild(document
										.createTextNode(", "));
							});
			chains.appendChild(createHeader("Chains"));
			c.appendChild(chains);
		})();
		(function() { // register SSL Feats
			var bugs = document.createElement("div");
			var table = document.createElement("table");
			table.setAttribute("class", "extTable");
			function addElem(name, callback) {
				var tr = document.createElement("tr");
				var td = document.createElement("td");
				td.appendChild(document.createTextNode(name));
				tr.appendChild(td);
				stream.registerEvent(name, function(c, s, e) {
					var r = document.createElement("td");
					r.textContent = callback(JSON.parse(e.data));
					tr.appendChild(r);
				});
				table.appendChild(tr);
			}
			bugs.appendChild(table);
			addElem("renegotiation", function(renego) {
				return renego.secure_renego;
			});
			addElem("heartbeat", function(heartbeat) {
				return heartbeat.heartbeat + ", test results ... beat: "
						+ heartbeat.test.heartbeat + ", bleed: "
						+ heartbeat.test.heartbleed;
			});
			addElem("sni", function(sni) {
				return sni.sni;
			});
			addElem("compression", function(compression) {
				return compression.supported + " test results ... accept: "
						+ compression.accepted;
			});
			c.appendChild(bugs);
		})();
		(function() { // register Cipher preference
			var certificateObservations = document.createElement("div");
			c.appendChild(certificateObservations);

			var cipherPreferenceW = document.createElement("div");
			cipherPreferenceW.appendChild(document
					.createTextNode("Server has cipher preference: "));
			var cipherPreference = document.createElement("span");
			cipherPreference.appendChild(document.createTextNode("unknown"));
			cipherPreferenceW.appendChild(cipherPreference);
			certificateObservations.appendChild(cipherPreferenceW);
			var tab = document.createElement("table");
			tab.setAttribute("class", "cipherTable")
			certificateObservations.appendChild(tab);

			stream.registerEvent("cipherpref", function(c, s, e) {
				var cipherpref = JSON.parse(e.data);
				cipherPreference.textContent = cipherpref.cipherpref;
			});
			stream.registerEvent("cipher", function(c, s, e) {
				var cipher = JSON.parse(e.data);
				var tr = document.createElement("tr");
				tr.setAttribute("id", idbase + "cipher-" + cipher.cipherid);
				if (tab.childNodes.length == 0) {
					var header = document.createElement("tr");
					for ( var key in cipher) {
						var td = document.createElement("th");
						td.appendChild(document.createTextNode(key));
						header.appendChild(td);
					}
					tab.appendChild(header)
				}
				if (cipher.encsize === 0) {
					cipher.encsize = "Stream";
					cipher.mode = "Stream";
				}
				for ( var key in cipher) {
					var td = document.createElement("td");
					td.setAttribute("data-value", cipher[key])
					var sfx = "size";
					if (key.indexOf(sfx, key.length - sfx.length) !== -1) {
						td.setAttribute("data-type", cipher[key.substring(0, key.length
								- sfx.length)
								+ "type"]);
					}
					td.setAttribute("class", "cipher-" + key);
					td.appendChild(document.createTextNode(cipher[key]));
					tr.appendChild(td);
				}
				tab.appendChild(tr);
			});
		})();
	}

	var container = document.getElementById('output');

	var url = hostInfoToURL({
		domain : domain,
		port : port
	});

	var stream = new Stream(container, url);

	stream.registerEvent("hostip", function(c, s, e) {
		var hostInfo = JSON.parse(e.data);

		var node = document.createElement("fieldset");
		c.appendChild(node);

		var stream = new HostIP(node, hostInfo, "obj-" + (idcounter++) + "-");
	});

}
