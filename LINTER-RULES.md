# Adding Linter Rules to OBDb Tooling

This document provides a step-by-step guide for adding new linter rules to the OBDb VS Code extension. Linter rules help validate signal definitions against established conventions and best practices.

## Table of Contents

1. [Understanding the Linter System](#understanding-the-linter-system)
2. [Basic Structure of a Linter Rule](#basic-structure-of-a-linter-rule)
3. [Step-by-Step Guide to Creating a New Rule](#step-by-step-guide-to-creating-a-new-rule)
4. [Testing Your New Rule](#testing-your-new-rule)
5. [Best Practices for Rule Development](#best-practices-for-rule-development)

## Understanding the Linter System

The OBDb tooling includes a linter system that validates signal definitions in JSON files. Each linter rule:

- Implements the `ILinterRule` interface
- Provides metadata about itself (ID, name, description, severity)
- Contains logic to validate a signal against specific criteria
- Returns validation results with contextual error messages

The linter system is composed of these key components:

- **Rule Interface**: Defined in `src/linter/rules/rule.ts`
- **Rule Registry**: Manages all rules in `src/linter/ruleRegistry.ts`
- **Signal Linter**: Runs rules against signals in `src/linter/signalLinter.ts`
- **Rule Implementations**: Individual rule files in `src/linter/rules/`

## Basic Structure of a Linter Rule

Each linter rule is a TypeScript class that implements the `ILinterRule` interface:

```typescript
export class MyCustomRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'my-custom-rule',       // Unique ID for the rule
      name: 'My Custom Rule',     // Display name
      description: 'Description of what this rule checks', // Explain the rule
      severity: LintSeverity.Warning, // Error, Warning, Information, or Hint
      enabled: true,              // Whether the rule is enabled by default
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    // Rule implementation logic
    if (/* condition that violates the rule */) {
      return {
        ruleId: this.getConfig().id,
        message: `Error message describing the violation for "${signal.id}"`,
        node: /* JSONC node to which the error applies */
      };
    }
    return null; // Return null if no violation is found
  }
}
```

## Step-by-Step Guide to Creating a New Rule

### 1. Create a New Rule File

Create a new file in the `src/linter/rules/` directory with a descriptive name. For example, if you're creating a rule to validate temperature units, name it `temperatureUnitRule.ts`.

### 2. Implement the ILinterRule Interface

In your new file, implement the `ILinterRule` interface:

```typescript
import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that validates temperature units
 */
export class TemperatureUnitRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'temperature-unit',
      name: 'Temperature Unit',
      description: 'Temperature signals should use celsius as the unit',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    // Detect if this is a temperature signal by checking ID or other properties
    if (signal.id.includes('TEMP') || signal.name.toLowerCase().includes('temperature')) {
      // Get the unit property node
      const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
      if (!fmtNode) return null;

      const unitNode = jsonc.findNodeAtLocation(fmtNode, ['unit']);
      if (!unitNode) return null;

      // Get the unit value
      const unit = jsonc.getNodeValue(unitNode);

      // Check if it's a temperature unit (celsius, fahrenheit, kelvin)
      const tempUnits = ['celsius', 'fahrenheit', 'kelvin'];
      if (!tempUnits.includes(unit)) {
        return {
          ruleId: this.getConfig().id,
          message: `Temperature signals should use a temperature unit (${tempUnits.join(', ')}). Found: "${unit}"`,
          node: unitNode
        };
      }

      // Prefer celsius specifically
      if (unit !== 'celsius') {
        return {
          ruleId: this.getConfig().id,
          message: `Temperature signals should preferably use "celsius" as the unit. Found: "${unit}"`,
          node: unitNode
        };
      }
    }

    return null;
  }
}
```

### 3. Register Your Rule in the Rule Registry

Open `src/linter/ruleRegistry.ts` and add your rule to the list of rules in the `loadAllRules` method:

```typescript
private loadAllRules(): void {
  // Create instances of all rule classes
  // When adding a new rule, just add it to this list
  const ruleClasses = [
    OdometerIdNamingRule,
    SignalNamingConventionRule,
    SuggestedMetricValidationRule,
    TemperatureUnitRule  // Add your new rule here
  ];

  // Instantiate each rule class
  for (const RuleClass of ruleClasses) {
    this.rules.push(new RuleClass());
  }
}
```

Don't forget to import your rule at the top of the file:

```typescript
import { TemperatureUnitRule } from './rules/temperatureUnitRule';
```

### 4. Understanding How to Access Signal Properties

When implementing your rule validation logic, you'll often need to access and validate different properties of the signal. Here are common patterns:

**Accessing Signal Properties Directly**:
```typescript
// Check the ID
if (signal.id.includes('SOME_TEXT')) { ... }

// Check the suggested metric
if (signal.suggestedMetric === 'odometer') { ... }

// Check format properties
if (signal.fmt && signal.fmt.unit === 'celsius') { ... }
```

**Using JSONC Parser to Find Nodes**:
```typescript
// Find specific nodes in the JSON tree
const idNode = jsonc.findNodeAtLocation(node, ['id']);
const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
const unitNode = jsonc.findNodeAtLocation(fmtNode, ['unit']);

// Get values from nodes
const unit = jsonc.getNodeValue(unitNode);
```

**Using Reusable Unit Validation**:
For many rules, you'll want to check if a unit belongs to a specific group. The project provides utility functions in `src/linter/unitGroups.ts`:

```typescript
import * as unitGroups from '../unitGroups';

// Check if a unit belongs to a group
if (!unitGroups.isTemperatureUnit(unit)) { ... }

// Access predefined unit groups
const temperatureUnits = unitGroups.TEMPERATURE_UNITS;
```

## Testing Your New Rule

After implementing your rule, you should test it to ensure it works correctly:

1. **Build the Extension**:
   ```bash
   npm run compile
   ```

2. **Run the Extension in Debug Mode**:
   - Press F5 to launch a new VS Code window with the extension
   - Open a JSON file containing signals
   - Your rule should now run and show diagnostics for any violations

3. **Validate Rule Behavior**:
   - Create test cases that should pass (no violations)
   - Create test cases that should fail (trigger violations)
   - Verify that the correct diagnostic messages appear

## Best Practices for Rule Development

1. **Clear Rule IDs**: Use kebab-case for rule IDs (e.g., `temperature-unit-check`)

2. **Descriptive Messages**: Error messages should explain:
   - What's wrong
   - What the expected value/format should be
   - What was actually found

3. **Appropriate Severity Levels**:
   - `Error`: For critical issues that must be fixed
   - `Warning`: For important issues that should be fixed
   - `Information`: For suggestions and best practices
   - `Hint`: For minor style recommendations

4. **Performance Considerations**:
   - Rules run on every file change, so keep them efficient
   - Return early when possible (e.g., check if applicable before deep validation)
   - Avoid expensive operations when possible

5. **Contextual Node Selection**:
   - When returning errors, select the most specific node (e.g., highlight just the unit property, not the entire signal)
   - This helps users quickly identify and fix the issue

## Example Rules

For reference, the project includes several example rules:

1. **OdometerIdNamingRule**: Validates that signals with suggestedMetric "odometer" have "ODO" in the ID
2. **SignalNamingConventionRule**: Checks that signal IDs use consistent naming conventions
3. **SuggestedMetricValidationRule**: Ensures signals with suggested metrics use appropriate units

Study these examples to understand the different validation patterns and techniques.

---

By following this guide, you should be able to create and integrate new linter rules into the OBDb tooling. These rules help maintain consistency and quality in signal definitions across the project.