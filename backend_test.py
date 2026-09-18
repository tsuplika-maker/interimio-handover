import requests
import sys
from datetime import datetime
import json

class InterimioAPITester:
    def __init__(self, base_url="https://interimio-preview.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.manager_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test API root endpoint"""
        return self.run_test("API Root", "GET", "", 200)

    def test_seed_managers(self):
        """Test seeding sample managers"""
        success, response = self.run_test("Seed Managers", "POST", "managers/seed", 200)
        return success

    def test_list_managers(self):
        """Test listing managers"""
        success, response = self.run_test("List Managers", "GET", "managers", 200)
        if success and response:
            managers = response
            if len(managers) >= 3:
                print(f"   Found {len(managers)} managers")
                # Store first manager ID for lead testing
                if managers:
                    self.manager_id = managers[0].get('id')
                    print(f"   Using manager ID: {self.manager_id}")
                return True
            else:
                print(f"   Expected at least 3 managers, got {len(managers)}")
                return False
        return success

    def test_search_managers(self):
        """Test manager search functionality"""
        # Test search by skill
        success1, _ = self.run_test("Search by Skill", "GET", "managers", 200, params={"q": "Cloud"})
        
        # Test search by location
        success2, _ = self.run_test("Search by Location", "GET", "managers", 200, params={"location": "Munich"})
        
        return success1 and success2

    def test_create_manager(self):
        """Test creating a new manager"""
        manager_data = {
            "name": "Test Manager",
            "title": "Test Interim CEO",
            "location": "Test City, DE",
            "daily_rate_eur": 1500,
            "bio": "Test bio for automated testing",
            "skills": ["Testing", "Automation", "QA"]
        }
        
        success, response = self.run_test("Create Manager", "POST", "managers", 200, data=manager_data)
        if success and response:
            print(f"   Created manager with ID: {response.get('id')}")
        return success

    def test_create_lead(self):
        """Test creating a lead/request"""
        if not self.manager_id:
            print("❌ No manager ID available for lead testing")
            return False
            
        lead_data = {
            "manager_id": self.manager_id,
            "company_name": "Test Company",
            "contact_name": "Test Contact",
            "email": "test@example.com",
            "days": 10,
            "daily_rate_eur": 1200,
            "message": "Test request message"
        }
        
        success, response = self.run_test("Create Lead", "POST", "leads", 200, data=lead_data)
        if success and response:
            fee = response.get('fee_eur')
            expected_fee = int(1200 * 10 * 0.20)  # 20% of daily_rate * days
            print(f"   Fee calculated: €{fee}, Expected: €{expected_fee}")
            if fee == expected_fee:
                print("✅ Fee calculation correct")
                return True
            else:
                print("❌ Fee calculation incorrect")
                return False
        return success

    def test_seed_discount_codes(self):
        """Test seeding discount codes"""
        return self.run_test("Seed Discount Codes", "POST", "discount-codes/seed", 200)

    def test_validate_discount_codes(self):
        """Test discount code validation"""
        # Test SHARE10 (10% off)
        success1, response1 = self.run_test("Validate SHARE10", "GET", "discount-codes/validate", 200, params={"code": "SHARE10"})
        if success1 and response1:
            expected_price = int(299 * 0.9)  # 10% off 299
            actual_price = response1.get('final_price_eur')
            print(f"   SHARE10: Expected €{expected_price}, Got €{actual_price}")
            if actual_price != expected_price:
                success1 = False

        # Test PARTNER50 (€50 off)
        success2, response2 = self.run_test("Validate PARTNER50", "GET", "discount-codes/validate", 200, params={"code": "PARTNER50"})
        if success2 and response2:
            expected_price = 299 - 50  # €50 off
            actual_price = response2.get('final_price_eur')
            print(f"   PARTNER50: Expected €{expected_price}, Got €{actual_price}")
            if actual_price != expected_price:
                success2 = False

        # Test VIP100 (€100 off)
        success3, response3 = self.run_test("Validate VIP100", "GET", "discount-codes/validate", 200, params={"code": "VIP100"})
        if success3 and response3:
            expected_price = 299 - 100  # €100 off
            actual_price = response3.get('final_price_eur')
            print(f"   VIP100: Expected €{expected_price}, Got €{actual_price}")
            if actual_price != expected_price:
                success3 = False

        # Test invalid code
        success4, response4 = self.run_test("Validate Invalid Code", "GET", "discount-codes/validate", 200, params={"code": "INVALID"})
        if success4 and response4:
            valid = response4.get('valid')
            if valid:
                print("   Invalid code should not be valid")
                success4 = False

        return success1 and success2 and success3 and success4

    def test_seed_courses(self):
        """Test seeding sample courses"""
        return self.run_test("Seed Courses", "POST", "courses/seed", 200)

    def test_list_courses(self):
        """Test listing courses"""
        success, response = self.run_test("List Courses", "GET", "courses", 200)
        if success and response:
            courses = response
            if len(courses) >= 2:
                print(f"   Found {len(courses)} courses")
                return True
            else:
                print(f"   Expected at least 2 courses, got {len(courses)}")
                return False
        return success

    def test_get_course_details(self):
        """Test getting course details with lessons"""
        # First get courses to get an ID
        success, response = self.run_test("Get Courses for Details", "GET", "courses", 200)
        if not success or not response:
            return False
        
        if len(response) == 0:
            print("   No courses available for detail testing")
            return False
            
        course_id = response[0].get('id')
        success, course_details = self.run_test("Get Course Details", "GET", f"courses/{course_id}", 200)
        
        if success and course_details:
            course = course_details.get('course')
            lessons = course_details.get('lessons', [])
            print(f"   Course: {course.get('title') if course else 'Unknown'}")
            print(f"   Lessons: {len(lessons)}")
            return len(lessons) >= 2
        return success

    def test_seed_podcasts(self):
        """Test seeding sample podcast episodes"""
        return self.run_test("Seed Podcasts", "POST", "podcasts/seed", 200)

    def test_list_podcasts(self):
        """Test listing podcast episodes"""
        success, response = self.run_test("List Podcasts", "GET", "podcasts", 200)
        if success and response:
            episodes = response
            if len(episodes) >= 2:
                print(f"   Found {len(episodes)} episodes")
                return True
            else:
                print(f"   Expected at least 2 episodes, got {len(episodes)}")
                return False
        return success

    def test_auth_register(self):
        """Test user registration"""
        user_data = {
            "email": f"test_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "TestPass123!",
            "role": "client"
        }
        
        success, response = self.run_test("Register User", "POST", "auth/register", 200, data=user_data)
        if success and response:
            user_id = response.get('user_id')
            next_step = response.get('next')
            print(f"   User ID: {user_id}")
            print(f"   Next step: {next_step}")
            return user_id is not None and next_step == "verify_email"
        return success

def main():
    print("🚀 Starting Interimio API Tests")
    print("=" * 50)
    
    tester = InterimioAPITester()
    
    # Test sequence
    tests = [
        ("API Root", tester.test_root_endpoint),
        ("Seed Managers", tester.test_seed_managers),
        ("List Managers", tester.test_list_managers),
        ("Search Managers", tester.test_search_managers),
        ("Seed Discount Codes", tester.test_seed_discount_codes),
        ("Validate Discount Codes", tester.test_validate_discount_codes),
        ("Seed Courses", tester.test_seed_courses),
        ("List Courses", tester.test_list_courses),
        ("Get Course Details", tester.test_get_course_details),
        ("Seed Podcasts", tester.test_seed_podcasts),
        ("List Podcasts", tester.test_list_podcasts),
        ("Auth Register", tester.test_auth_register),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())