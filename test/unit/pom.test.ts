import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PomError, isWellFormedXml, listDependencies, removeDependencies } from "../../src/core/apply/index.js";
import { FIXTURE } from "../helpers/mini-starter.js";

const pom = readFileSync(join(FIXTURE, "apps/api/pom.xml"), "utf8");

describe("removeDependencies (pom.xml through an XML parser)", () => {
  it("removes exactly the listed groupId:artifactId and keeps the rest byte for byte", () => {
    const out = removeDependencies(pom, ["io.jsonwebtoken:jjwt-api", "org.springframework.boot:spring-boot-starter-security"]);
    expect(listDependencies(out)).toEqual([
      "org.springframework.boot:spring-boot-starter-web",
      "org.springframework.boot:spring-boot-starter-mail",
    ]);
    expect(isWellFormedXml(out)).toBe(true);
    // comments, order, plugins and formatting are preserved
    expect(out).toContain("<!-- always present -->");
    expect(out).toContain("<artifactId>spring-boot-maven-plugin</artifactId>");
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<project')).toBe(true);
    expect(out.endsWith("</project>\n")).toBe(true);
    expect(out).not.toMatch(/\n\s*\n\s*<dependency>/);
  });

  it("returns the input unchanged when nothing matches", () => {
    expect(removeDependencies(pom, ["x:y"])).toBe(pom);
    expect(removeDependencies(pom, [])).toBe(pom);
  });

  it("never touches plugin dependencies under <build>", () => {
    const xml = `<project><build><plugins><plugin><dependencies><dependency><groupId>a</groupId><artifactId>b</artifactId></dependency></dependencies></plugin></plugins></build></project>`;
    expect(removeDependencies(xml, ["a:b"])).toBe(xml);
  });

  it("also prunes <dependencyManagement>", () => {
    const xml = `<project>\n  <dependencyManagement>\n    <dependencies>\n      <dependency>\n        <groupId>a</groupId>\n        <artifactId>b</artifactId>\n      </dependency>\n    </dependencies>\n  </dependencyManagement>\n</project>\n`;
    expect(listDependencies(removeDependencies(xml, ["a:b"]))).toEqual([]);
  });

  it("invalid XML: PomError naming the file", () => {
    expect(() => removeDependencies("<project><dependencies></project>", ["a:b"], "apps/api/pom.xml")).toThrow(PomError);
    expect(() => removeDependencies("<project><dependencies></project>", ["a:b"], "apps/api/pom.xml")).toThrow(/apps\/api\/pom.xml/);
  });
});
