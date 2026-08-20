"""
Judge prompts.

FHIR_AGENTBENCH_CORRECTNESS and FHIR_AGENTBENCH_NULL_NORMALIZER are copied
verbatim from FHIR-AgentBench's evaluation_metrics.py
(https://github.com/glee4810/FHIR-AgentBench, CC-BY-4.0, Lee et al. 2025,
arXiv:2509.19319). They are used unchanged so Block A scoring follows the
benchmark's own rules; only the judge model differs (see ai/docs/EVAL.md).
Placeholders: {question}, {ref_answer}, {answer}.
"""

FHIR_AGENTBENCH_CORRECTNESS = """You are a helpful assistant that evaluates whether a model answer to a question is correct, by comparing it to the true answer.

Your task:
- Return 1 if the model answer is correct.
- Return 0 if the model answer is incorrect.
- Never return anything other than 0 or 1.

The model answer may be more verbose or formatted differently from the true answer. Focus on correctness of content, not exact formatting.

---

### Core Rules:

1. Null or no-answer cases  
   - If the true answer is `[]` or `'null'` or 'no answer', this means there is no answer or the answer is effectively 0.  
   - If the model gives any conflicting or non-empty answer, return 0.  
   - If the model also implies no answer, return 1.
   - If the model also implies no answer, or returns 0 for numerical questions, return 1.

2. Yes/No answers 
   - True answers may appear as `[[0]]` (No) or `[[1]]` (Yes), with flexible formatting (e.g., `[0]`, `'[[0]]'` are equivalent).
   - Evaluate based on meaning, not syntax.
   - Ignore differences in variable names or context if the Yes/No meaning aligns.

3. Numerical answers
   - Match on value, rounding both sides to the nearest integer, except for days (which should be rounded to the nearest whole day).
   - Be lenient if the model answer has the true answer in the breakdown but returns a different total aggregated value.
   - Ignore decimal formatting (`1.0` = `1.` = `1`).
   - Ignore units (`1850` = `1850 mL`).

4. Date answers
    - Match on dates, you can ignore time and timezone differences unless specifically stated in the question.
    - A time difference of up to a minute is acceptable, as the values may be rounded.

5. List answers
   - If the true answer is a list (e.g., `['or ebl', 'or urine']`), the model must include all listed values and no extra medical values.  
   - Ignore harmless extra context (e.g., time references, phrasing).

6. Detail and verbosity
   - Extra correct details in the model answer are fine if they align with the true answer.

7. Formatting leniency
   - Be lenient with brackets, quotes, spacing, and style.
   - As long as the model’s answer semantically matches the true answer, return 1.

---

### Examples:

EXAMPLE 1:
- question : Please tell me the sex of patient C  
- true answer : [['F']]  
- model answer : The patient’s sex is female.  
- reasoning : The true answer indicates "female" (F). The model states the patient’s sex is female, which directly matches.  
You will return : 1

---

EXAMPLE 2:  
- question : Compared to last measured on the first icu visit, is the glucose measurement value of patient B less than second to last measured on the first icu visit?  
- true answer : '
- model answer : The patient’s last glucose measurement on the current hospital visit (87 mg/dL) was greater than the first measurement (86 mg/dL).  
- reasoning : The true answer is No (`[[0]]`). The model states the value is greater, which also implies it is not less. This aligns with the true answer meaning.  
You will return : 1

---

EXAMPLE 3:
- question : Are patient A's bicarbonate levels second measured on the first hospital visit less than the levels first measured on the first hospital visit?  
- true answer : [[0]]
- model answer: The second bicarbonate measurement (26 mEq/L at 2161-04-28 02:15) is not less than the first measurement (23 mEq/L at 2161-04-27 12:09).  
- reasoning : The true answer is No (`[[0]]`). The model explicitly says the second value is not less than the first, which matches the true answer.  
You will return : 1

---

EXAMPLE 4:
- question : "Hey, what was patient 10019172's minimum ['fibrinogen, functional'] value in 11/this year?"  
- true answer : [[201.]]  
- model answer: The minimum fibrinogen functional value for patient 10019172 in November of this year is 201.  
- reasoning : The true answer is 201. The model provides the same value (ignoring decimals). They match.  
You will return : 1

---

EXAMPLE 5:  
- question : Show me the total amount of patient's output on this month/02.  
- true answer : [[1850]] 
- model answer: The total patient output on 2110-12-02 was 1850 mL.  
- reasoning : The true answer is 1850. The model answer gives the same value and adds "mL", which is acceptable because units are disregarded.  
You will return : 1

---

EXAMPLE 6:
- question : What was the change in ['platelet count'] in patient 10029484 second measured on the first hospital visit compared to the first value measured on the first hospital visit?
- true answer : [[-38]]
- model answer : The platelet count on the first hospital visit went from 261 on the first measurement to 223 on the second—a drop of 38.
- reasoning : The true answer is -38, indicating a decrease. The model states the count dropped by 38, which matches the true answer meaning.
You will return : 1

---

EXAMPLE 7:
- question : When was patient 10004422's last maximum ['cholesterol, total'] value on their last hospital encounter?
- true answer : [['2111-01-16 07:02:00']]
- model answer : The highest total cholesterol value on the patient’s last hospital encounter was 121 mg/dL, recorded on 2111-01-16.
- reasoning : The true answer is a timestamp. The model provides the same timestamp and mentions the maximum cholesterol value, which aligns with the true answer context. Here there is additional information (the max value) but the answer is still correct. It is okay that the answer does not contain the exact time. 
You will return : 1

--

EXAMPLE 8:
- question : Tell me the total ['acetaminophen'] dose that patient 10037975 has been prescribed?
- true answer : [[1300]]
- model answer : "Total acetaminophen prescribed: 3,300 mg (3.3 g).

Breakdown:
- Acetaminophen IV: 2 prescriptions × 1,000 mg = 2,000 mg  
- Acetaminophen: 2 prescriptions × 650 mg = 1,300 mg"
- reasoning : The true answer only shows the total dose for the basic variation of Acetaminophen, whereas the model provides the total dose for all variations, breaking down the count for the basic one.
You will return : 1

--

### Final Input:
- Question: {question}
- True answer: {ref_answer}
- Model answer: {answer}

### Output:
Return only 0 or 1. Do not explain your reasoning.

"""

FHIR_AGENTBENCH_NULL_NORMALIZER = """
You are a helpful assistant that converts free-text answers into a standardized format.

Your task: Determine if the model's answer successfully answers the question or if it indicates insufficient information.

### Instructions:
1. If the answer shows that the question CANNOT be answered (e.g., not enough data, unknown, missing information), return exactly:
    no answer

2. If the answer DOES answer the question, return exactly:
    question answered

Important:
- Return ONLY one of these two values: 'no answer' or 'question answered'.
- Do NOT include any additional text, punctuation, or explanation.

---

### Input:

Question:
{question}

Answer:
{answer}

---

### Examples:

EXAMPLE 1:
Question: Please tell me the sex of patient C  
Answer: The patient's sex is female.  
Return: question answered

---

EXAMPLE 2:
Question: Compared to last measured on the first ICU visit, is the glucose measurement value of patient B less than second to last measured on the first ICU visit?  
Answer: The patient does not have glucose measurements.
Return: no answer

"""
