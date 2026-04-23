"""Simple script to test debugging tools."""

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


def process_items(items):
    results = []
    for item in items:
        doubled = item * 2
        results.append(doubled)
    total = sum(results)
    return total


def main():
    # Test factorial
    x = 5
    result = factorial(x)
    print(f"factorial({x}) = {result}")

    # Test process_items
    numbers = [1, 2, 3, 4, 5]
    total = process_items(numbers)
    print(f"Total: {total}")

    # Final output
    message = f"Done: factorial={result}, total={total}"
    print(message)


if __name__ == "__main__":
    main()
